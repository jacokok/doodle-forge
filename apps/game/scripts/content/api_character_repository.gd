extends "res://scripts/content/character_repository.gd"
const Validator = preload("res://scripts/content/contract_validator.gd")
const JSON_LIMIT := 1048576
var _host: Node
var _base_url: String
var _catalog: Dictionary = {}
var _manifests: Dictionary = {}
var _busy := false
var _cache: RefCounted

func _init(host: Node, base_url: String = "http://127.0.0.1:5173", cache: RefCounted = null) -> void:
	_host = host
	_base_url = base_url.trim_suffix("/")
	_cache = cache

func _error(code: String) -> Dictionary:
	return {"ok": false, "error": code}

func _sha256(bytes: PackedByteArray) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(bytes)
	return context.finish().hex_encode()

func _read(route: String, limit: int) -> Dictionary:
	# One bounded request per repository, no redirects or transparent decompression.
	if _busy:
		return _error("busy")
	var origin := RegEx.new()
	origin.compile("^http://(127\\.0\\.0\\.1|localhost|\\[::1\\])(:[0-9]{1,5})?$")
	if origin.search(_base_url) == null or not is_instance_valid(_host) or not _host.is_inside_tree():
		return _error("invalid_configuration")
	_busy = true
	var request := HTTPRequest.new()
	request.body_size_limit = limit
	request.timeout = 5.0
	request.max_redirects = 0
	request.accept_gzip = false
	_host.add_child(request)
	var started := request.request(_base_url + route)
	if started != OK:
		request.queue_free()
		_busy = false
		return _error("request_failed")
	var response: Array = await request.request_completed
	request.queue_free()
	_busy = false
	if response[0] != HTTPRequest.RESULT_SUCCESS:
		return _error("transport_or_size_limit")
	if response[1] != 200:
		return _error("http_%d" % response[1])
	return {"ok": true, "value": response[3]}

func _json(bytes: PackedByteArray, kind: String) -> Dictionary:
	var text := bytes.get_string_from_utf8()
	if text.to_utf8_buffer() != bytes:
		return _error("invalid_utf8")
	var parser := JSON.new()
	if parser.parse(text) != OK:
		return _error("invalid_json")
	return Validator.validate(parser.data, kind)

func list_characters() -> Dictionary:
	if _catalog.is_empty():
		var response := await _read("/api/content/index", JSON_LIMIT)
		if not response.ok:
			return response
		var parsed := _json(response.value, "release-index")
		if not parsed.ok:
			return parsed
		_catalog = parsed.value.duplicate(true)
	# Defensive copies prevent callers from rewriting the pinned authority.
	return {"ok": true, "value": _catalog.duplicate(true)}

func get_manifest(character_id: String, version: int) -> Dictionary:
	if _catalog.is_empty():
		return _error("catalog_not_pinned")
	var selected := {}
	for entry in _catalog.characters:
		if entry.characterId == character_id and entry.characterVersion == version:
			selected = entry
	if selected.is_empty():
		return _error("revision_not_in_release")
	if _manifests.has(character_id):
		return {"ok": true, "value": _manifests[character_id].duplicate(true)}
	var route := "/api/content/characters/%s/versions/%d/manifest" % [character_id, version]
	var response := await _read(route, JSON_LIMIT)
	if not response.ok:
		return response
	if _sha256(response.value) != selected.manifestSha256:
		return _error("manifest_hash")
	var parsed := _json(response.value, "character")
	if not parsed.ok:
		return parsed
	if parsed.value.characterId != character_id or parsed.value.characterVersion != version:
		return _error("manifest_identity")
	_manifests[character_id] = parsed.value.duplicate(true)
	return parsed

func get_asset_bytes(asset_ref: Dictionary) -> Dictionary:
	if asset_ref.size() != 3 or not asset_ref.get("characterId") is String or not asset_ref.get("characterVersion") is int or not asset_ref.get("assetId") is String:
		return _error("invalid_asset_reference")
	var manifest := await get_manifest(asset_ref.characterId, asset_ref.characterVersion)
	if not manifest.ok:
		return manifest
	if not manifest.value.assets.has(asset_ref.assetId):
		return _error("unknown_asset")
	var asset: Dictionary = manifest.value.assets[asset_ref.assetId]
	if _cache != null:
		var cached: Dictionary = _cache.read(asset.sha256, int(asset.bytes))
		if not cached.ok:
			return cached
		if cached.hit:
			var checked := _validate_asset(cached.value, asset)
			if not checked.ok:
				return _cache.invalidate(asset.sha256)
			return checked
	var route := "/api/content/characters/%s/versions/%d/assets/%s.png" % [asset_ref.characterId, asset_ref.characterVersion, asset.sha256]
	var response := await _read(route, int(asset.bytes))
	if not response.ok:
		return response
	var checked := _validate_asset(response.value, asset)
	if not checked.ok:
		return checked
	if _cache != null:
		var installed: Dictionary = _cache.install(asset.sha256, response.value)
		if not installed.ok:
			return installed
	return checked

func _validate_asset(bytes: PackedByteArray, asset: Dictionary) -> Dictionary:
	if bytes.size() != asset.bytes or _sha256(bytes) != asset.sha256:
		return _error("asset_integrity")
	if bytes.size() < 24 or bytes.slice(0, 8) != PackedByteArray([137, 80, 78, 71, 13, 10, 26, 10]) or bytes.slice(12, 16).get_string_from_ascii() != "IHDR":
		return _error("png_header")
	# PNG dimensions are big endian; resource admission/native decode still follow.
	var width := bytes[16] * 16777216 + bytes[17] * 65536 + bytes[18] * 256 + bytes[19]
	var height := bytes[20] * 16777216 + bytes[21] * 65536 + bytes[22] * 256 + bytes[23]
	if width != asset.width or height != asset.height:
		return _error("png_dimensions")
	return {"ok": true, "value": bytes}
