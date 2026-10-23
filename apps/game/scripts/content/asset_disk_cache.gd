extends RefCounted
# Fixed slots bound both directory work and storage; no unbounded directory scan.
const SLOTS := 16
const LIMIT := 16 * 1024 * 1024
const HEADER := 64
var _root: String

func _init(cache_name: String = "v1") -> void:
	var safe := RegEx.new()
	safe.compile("^[a-z0-9-]{1,64}$")
	if safe.search(cache_name) != null:
		_root = "user://content-cache/" + cache_name

func _error() -> Dictionary:
	return {"ok": false, "error": "cache_filesystem"}

func _key_valid(key: String) -> bool:
	var pattern := RegEx.new()
	pattern.compile("^[0-9a-f]{64}$")
	return pattern.search(key) != null

func _slot(key: String) -> String:
	return _root + "/%02d" % (key.substr(0, 2).hex_to_int() % SLOTS)

func _link(path: String) -> bool:
	var parent := DirAccess.open(path.get_base_dir())
	# Treat an inaccessible parent as unsafe, not a missing entry or script error.
	return parent == null or parent.is_link(path.get_file())

func _acquire() -> bool:
	if _root.is_empty():
		return false
	# Check each app-owned component before traversing it. Trusted local FS only:
	# Godot does not offer race-free no-follow opens against hostile mutation.
	for path in ["user://content-cache", _root]:
		if _link(path) or (FileAccess.file_exists(path) and not DirAccess.dir_exists_absolute(path)):
			return false
		if DirAccess.make_dir_recursive_absolute(path) != OK:
			return false
	if DirAccess.make_dir_absolute(_root + "/lock") != OK:
		return false
	for index in SLOTS:
		var temp := _root + "/%02d.tmp" % index
		if _link(temp) or DirAccess.dir_exists_absolute(temp) or (FileAccess.file_exists(temp) and DirAccess.remove_absolute(temp) != OK):
			_release()
			return false
	return true

func _release() -> bool:
	return DirAccess.remove_absolute(_root + "/lock") == OK

func read(key: String, length: int) -> Dictionary:
	if not _key_valid(key) or length < 1 or length > LIMIT:
		return {"ok": false, "error": "cache_reference"}
	if not _acquire():
		return _error()
	var result := _read_locked(key, length)
	if not _release():
		return _error()
	return result

func _read_locked(key: String, length: int) -> Dictionary:
	var path := _slot(key) + ".entry"
	if _link(path) or DirAccess.dir_exists_absolute(path):
		return _error()
	if not FileAccess.file_exists(path):
		return {"ok": true, "hit": false}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _error()
	var size := file.get_length()
	# No payload allocation before size admission, including hostile oversized files.
	if size < HEADER or size > HEADER + LIMIT:
		file.close()
		return _discard(path)
	var header_bytes := file.get_buffer(HEADER)
	for byte in header_bytes:
		if not (byte >= 48 and byte <= 57 or byte >= 97 and byte <= 102):
			file.close()
			return _discard(path)
	var header := header_bytes.get_string_from_ascii()
	if not _key_valid(header):
		file.close()
		return _discard(path)
	if header != key:
		file.close()
		return {"ok": true, "hit": false}
	if size != HEADER + length:
		file.close()
		return _discard(path)
	var bytes := file.get_buffer(length)
	var valid := bytes.size() == length and file.get_error() == OK
	file.close()
	if not valid:
		return _error()
	return {"ok": true, "hit": true, "value": bytes}

func _discard(path: String) -> Dictionary:
	if DirAccess.remove_absolute(path) != OK:
		return _error()
	return {"ok": false, "error": "cache_corrupt"}

func invalidate(key: String) -> Dictionary:
	if not _key_valid(key) or not _acquire():
		return _error()
	var path := _slot(key) + ".entry"
	var result := _error() if _link(path) else _discard(path)
	if not _release():
		return _error()
	return result

func install(key: String, bytes: PackedByteArray) -> Dictionary:
	if not _key_valid(key) or bytes.is_empty() or bytes.size() > LIMIT:
		return {"ok": false, "error": "cache_reference"}
	if not _acquire():
		return _error()
	var result := _install_locked(key, bytes)
	if not _release():
		return _error()
	return result

func _install_locked(key: String, bytes: PackedByteArray) -> Dictionary:
	var slot := _slot(key)
	for path in [slot + ".tmp", slot + ".entry"]:
		if _link(path) or DirAccess.dir_exists_absolute(path):
			return _error()
	# A previous interrupted temp is never read; replace only this known slot.
	var file := FileAccess.open(slot + ".tmp", FileAccess.WRITE)
	if file == null:
		return _error()
	file.store_buffer(key.to_ascii_buffer())
	file.store_buffer(bytes)
	file.flush()
	var valid := file.get_error() == OK and file.get_position() == HEADER + bytes.size()
	file.close()
	if not valid:
		return _error()
	if DirAccess.rename_absolute(slot + ".tmp", slot + ".entry") != OK:
		return _error()
	return {"ok": true}
