extends SceneTree
const Cache = preload("res://scripts/content/asset_disk_cache.gd")
const Api = preload("res://scripts/content/api_character_repository.gd")
const Resources = preload("res://scripts/content/character_resources.gd")
var assertions := 0
var cache_name := "test-" + str(OS.get_process_id())
var directory := "user://content-cache/" + cache_name

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		print(JSON.stringify({"suite": "cache", "status": "failed", "reason": label}))
		quit(1)
		assert(false, label)

func write(path: String, bytes: PackedByteArray) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_buffer(bytes)
	file.close()

func run() -> void:
	var cache = Cache.new(cache_name)
	var a := "00" + "a".repeat(62)
	var b := "10" + "b".repeat(62)
	var bytes := PackedByteArray([1, 2, 3])
	check(not cache.read("../escape", 3).ok, "unsafe_key")
	check(not cache.read(a, Cache.LIMIT + 1).ok, "read_limit_before_io")
	check(not cache.read(a, 0).ok, "zero_length")
	check(not Cache.new("../escape").read(a, 3).ok, "unsafe_namespace")
	check(cache.read(a, 3).ok and not cache.read(a, 3).hit, "cold_miss")
	check(cache.install(a, bytes).ok, "atomic_install")
	check(not FileAccess.file_exists(directory + "/00.tmp"), "rename_consumes_temp")
	check(cache.read(a, 3).value == bytes, "exact_read")
	DirAccess.make_dir_absolute(directory + "/00.tmp")
	check(not cache.install(b, bytes).ok, "failed_install_explicit")
	DirAccess.remove_absolute(directory + "/00.tmp")
	check(cache.read(a, 3).value == bytes, "failed_install_preserves_old_complete_entry")
	check(cache.install(b, bytes).ok and not cache.read(a, 3).hit, "collision_evicts")
	check(cache.read(b, 3).hit, "replacement_present")
	check(cache.read(b, 2).get("error") == "cache_corrupt", "length_corruption_deleted")
	check(not cache.read(b, 3).hit, "deliberate_retry_misses")
	write(directory + "/00.entry", "broken".to_ascii_buffer())
	check(cache.read(a, 3).get("error") == "cache_corrupt", "short_header")
	var oversized := FileAccess.open(directory + "/00.entry", FileAccess.WRITE)
	oversized.seek(Cache.LIMIT + Cache.HEADER)
	oversized.store_8(0)
	oversized.close()
	check(cache.read(a, 3).get("error") == "cache_corrupt", "oversize_before_payload_read")
	write(directory + "/00.tmp", "interrupted".to_ascii_buffer())
	check(not cache.read(a, 3).hit and not FileAccess.file_exists(directory + "/00.tmp"), "interrupted_temp_not_visible")
	DirAccess.make_dir_absolute(directory + "/lock")
	check(cache.read(a, 3).get("error") == "cache_filesystem", "stale_or_concurrent_lock_fails")
	DirAccess.remove_absolute(directory + "/lock")
	DirAccess.make_dir_absolute(directory + "/00.entry")
	check(not cache.install(a, bytes).ok and not cache.read(a, 3).ok, "filesystem_obstruction")
	DirAccess.remove_absolute(directory + "/00.entry")
	write(directory + "/outside", bytes)
	check(DirAccess.open(directory).create_link(ProjectSettings.globalize_path(directory + "/outside"), ProjectSettings.globalize_path(directory + "/00.entry")) == OK, "test_symlink_created")
	check(not cache.read(a, 3).ok and not cache.install(a, bytes).ok, "symlink_entry_refused")
	check(FileAccess.get_file_as_bytes(directory + "/outside") == bytes, "symlink_target_unchanged")
	DirAccess.remove_absolute(directory + "/00.entry")
	DirAccess.remove_absolute(directory + "/outside")
	var linked_name := cache_name + "-link"
	var linked_path := "user://content-cache/" + linked_name
	check(DirAccess.open("user://content-cache").create_link(ProjectSettings.globalize_path(directory), ProjectSettings.globalize_path(linked_path)) == OK, "test_root_symlink_created")
	check(not Cache.new(linked_name).read(a, 3).ok, "symlink_root_refused")
	DirAccess.remove_absolute(linked_path)
	var large := PackedByteArray()
	large.resize(Cache.LIMIT + 1)
	check(not cache.install(a, large).ok, "write_bound")
	large.clear()
	for index in 32:
		check(cache.install("%02x" % index + "c".repeat(62), bytes).ok, "bounded_slot_install")
	check(DirAccess.get_files_at(directory).size() == Cache.SLOTS, "fixed_entry_count_bound")
	# Real HTTP repository: index/manifest authority is never persisted.
	var base := OS.get_environment("DOODLEFORGE_CONTENT_TEST_CACHE")
	var repo = Api.new(root, base, cache)
	var catalog: Dictionary = await repo.list_characters()
	check(catalog.ok, "http_catalog")
	var id: String = catalog.value.characters[0].characterId
	var manifest: Dictionary = await repo.get_manifest(id, 1)
	check(manifest.ok, "http_manifest")
	var asset_id: String = manifest.value.assets.keys()[0]
	var asset: Dictionary = manifest.value.assets[asset_id]
	var ref := {"characterId": id, "characterVersion": 1, "assetId": asset_id}
	var first: Dictionary = await repo.get_asset_bytes(ref)
	check(first.ok, "http_miss_installs")
	check((await repo.get_asset_bytes(ref)).value == first.value, "validated_hit")
	var second = Api.new(root, base, Cache.new(cache_name))
	check((await second.list_characters()).ok and (await second.get_asset_bytes(ref)).ok, "new_instance_hit_requires_online_authority")
	check(not (await second.get_asset_bytes({"characterId": id, "characterVersion": 2, "assetId": asset_id})).ok, "cache_cannot_authorize_revision")
	var path: String = cache._slot(asset.sha256) + ".entry"
	var corrupt: PackedByteArray = first.value.duplicate()
	corrupt[corrupt.size() - 1] ^= 1
	write(path, asset.sha256.to_ascii_buffer() + corrupt)
	check((await repo.get_asset_bytes(ref)).get("error") == "cache_corrupt", "same_length_corruption_fails_no_http_retry")
	check(not FileAccess.file_exists(path), "corrupt_entry_removed")
	check((await repo.get_asset_bytes(ref)).ok, "explicit_retry_fetches_same_pinned_asset")
	check(Resources.decode((await second.get_asset_bytes(ref)).value, asset).ok, "cached_bytes_still_decode")
	# A matching hash cannot bypass PNG header/dimension validation.
	var altered: Dictionary = repo._manifests[id].duplicate(true)
	altered.assets[asset_id].width = 512
	repo._manifests[id] = altered
	check((await repo.get_asset_bytes(ref)).get("error") == "cache_corrupt", "pinned_dimensions_rechecked")
	for filename in DirAccess.get_files_at(directory):
		DirAccess.remove_absolute(directory + "/" + filename)
	DirAccess.remove_absolute(directory)
	print(JSON.stringify({"suite": "cache", "status": "passed", "assertions": assertions}))
	quit(0)
