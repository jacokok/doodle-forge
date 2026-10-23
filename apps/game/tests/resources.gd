extends SceneTree
const Resources = preload("res://scripts/content/character_resources.gd")
const Factory = preload("res://scripts/content/character_factory.gd")
const FIXTURE := "res://../../packages/contracts/fixtures/sprout/v1/"
var assertions := 0

class MemoryRepository extends RefCounted:
	var data: Dictionary
	var buffers := {}
	var reads := 0
	var pause := false
	signal resume
	func list_characters() -> Dictionary:
		return {"ok": true, "value": {"releaseId": "test-release"}}
	func get_manifest(_id: String, _version: int) -> Dictionary:
		return {"ok": true, "value": data}
	func get_asset_bytes(ref: Dictionary) -> Dictionary:
		reads += 1
		if pause:
			await resume
		return {"ok": true, "value": buffers[ref.assetId]}

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		print(JSON.stringify({"suite": "resources", "status": "failed", "reason": label}))
		quit(1)
		assert(false, label)

func metadata(bytes: PackedByteArray, width := 256, height := 256) -> Dictionary:
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	return {"bytes": bytes.size(), "sha256": hash.finish().hex_encode(), "width": width, "height": height}

func corrupt_idat(bytes: PackedByteArray) -> PackedByteArray:
	var corrupt := bytes.duplicate()
	var offset := 33
	while corrupt.slice(offset + 4, offset + 8).get_string_from_ascii() != "IDAT":
		var length := corrupt[offset] * 16777216 + corrupt[offset + 1] * 65536 + corrupt[offset + 2] * 256 + corrupt[offset + 3]
		offset += length + 12
	corrupt[offset + 8] = 0
	return corrupt

func run() -> void:
	var repo := MemoryRepository.new()
	repo.data = JSON.parse_string(FileAccess.get_file_as_string(FIXTURE + "character.json"))
	for id in repo.data.assets:
		repo.buffers[id] = FileAccess.get_file_as_bytes(FIXTURE + repo.data.assets[id].path)
	var original: Dictionary = repo.data.duplicate(true)
	# Genuine runtime, multirow PNG, with three distinguishable frames.
	var image := Image.create(512, 512, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	image.fill_rect(Rect2i(0, 0, 256, 256), Color.RED)
	image.fill_rect(Rect2i(256, 0, 256, 256), Color.GREEN)
	image.fill_rect(Rect2i(0, 256, 256, 256), Color.BLUE)
	var bytes := image.save_png_to_buffer()
	var id: String = repo.data.animations.idle.assetId
	repo.buffers[id] = bytes
	var asset: Dictionary = repo.data.assets[id]
	asset.merge(metadata(bytes, 512, 512), true)
	repo.data.animations.idle.columns = 2
	repo.data.animations.idle.frameCount = 3
	repo.data.animations.idle.fps = 7
	var built := await Resources.build(repo, repo.data)
	check(built.ok, "multirow_build")
	var frames: SpriteFrames = built.value.frames
	check(frames.get_frame_count("idle") == 3 and frames.get_animation_speed("idle") == 7 and frames.get_animation_loop("idle"), "count_fps_loop")
	check(not frames.get_animation_loop("attack_light") and not frames.get_animation_loop("knockout"), "one_shots")
	var colors := [Color.RED, Color.GREEN, Color.BLUE]
	for i in 3:
		var atlas: AtlasTexture = frames.get_frame_texture("idle", i)
		check(atlas.region == Rect2((i % 2) * 256, floori(float(i) / 2) * 256, 256, 256), "row_major_%d" % i)
		check(atlas.get_image().get_pixel(128, 128).is_equal_approx(colors[i]), "actual_pixels_%d" % i)
	check(frames.get_frame_texture("idle", 0).atlas == frames.get_frame_texture("idle", 2).atlas, "shared_sheet")
	var factory := Factory.new(repo)
	repo.pause = true
	var pending: Array = []
	start_create(factory, repo.data.characterId, pending)
	check((await factory.create(repo.data.characterId, 1, root)).get("error") == "factory_busy", "whole_load_serialized")
	repo.pause = false
	repo.resume.emit()
	while pending.is_empty():
		await process_frame
	check(pending[0].ok, "serialized_load_finishes")
	pending[0].value.free()
	var made := await factory.create(repo.data.characterId, 1, root)
	check(made.ok, "factory")
	check(made.value.sprite.position == Vector2(-128, -224) and made.value.health == repo.data.stats.health, "anchor_stats")
	repo.data.stats.health = 1
	check(made.value.maximum_health != 1, "owned_definition")
	made.value.free()
	# Budget failures precede all asset requests and leave the scene untouched.
	repo.data = original.duplicate(true)
	for i in 3:
		var extra: Dictionary = original.assets.values()[0].duplicate(true)
		extra.bytes = 16777216
		repo.data.assets["extra%d" % i] = extra
	repo.reads = 0
	var child_count := root.get_child_count()
	var refused := await factory.create(repo.data.characterId, 1, root)
	check(refused.get("error") == "character_resource_limit" and repo.reads == 0 and root.get_child_count() == child_count, "encoded_preflight_no_spawn")
	repo.data = original.duplicate(true)
	for i in 2:
		var extra: Dictionary = original.assets.values()[0].duplicate(true)
		extra.width = 4096
		extra.height = 4096
		repo.data.assets["extra%d" % i] = extra
	check((await Resources.build(repo, repo.data)).get("error") == "character_resource_limit" and repo.reads == 0, "decoded_preflight")
	check(Resources.decode(bytes, metadata(bytes, 256, 256)).get("error") == "png_dimensions_or_limit", "actual_dimensions_before_decode")
	var oversized := bytes.duplicate()
	oversized[16] = 127
	check(Resources.decode(oversized, metadata(oversized, 2130706944, 512)).get("error") == "png_dimensions_or_limit", "hostile_ihdr_before_decode")
	check(Resources.decode(bytes.slice(0, 33), metadata(bytes.slice(0, 33), 512, 512)).get("error") == "png_chunks", "header_only_not_decodable")
	var ancillary := bytes.slice(0, 33)
	ancillary.append_array(PackedByteArray([0, 0, 0, 0, 122, 84, 88, 116, 0, 0, 0, 0]))
	ancillary.append_array(bytes.slice(33))
	check(Resources.decode(ancillary, metadata(ancillary, 512, 512)).get("error") == "png_unsupported_chunk", "compressed_metadata_refused_before_decode")
	var animated := bytes.slice(0, 33)
	animated.append_array(PackedByteArray([0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]))
	animated.append_array(bytes.slice(33))
	check(Resources.decode(animated, metadata(animated, 512, 512)).get("error") == "png_chunks", "apng_refused")
	check(Resources.decode(bytes, metadata(bytes.slice(0, -1), 512, 512)).get("error") == "asset_integrity", "byte_length_rechecked")
	var incorrect_hash := metadata(bytes, 512, 512)
	incorrect_hash.sha256 = "0".repeat(64)
	check(Resources.decode(bytes, incorrect_hash).get("error") == "asset_integrity", "hash_rechecked")
	# Corrupt IDAT payload while retaining a complete, correctly hashed container.
	var corrupt := corrupt_idat(bytes)
	check(Resources.decode(corrupt, metadata(corrupt, 512, 512)).get("error") == "png_decode", "native_decode_rejects_hash_valid_corruption")
	repo.data = original.duplicate(true)
	id = repo.data.assets.keys()[0]
	# Keep valid manifest layout; use a corrupt 256x256 fixture for factory failure.
	var bad := corrupt_idat(FileAccess.get_file_as_bytes(FIXTURE + original.assets[id].path))
	repo.buffers[id] = bad
	repo.data.assets[id].merge(metadata(bad), true)
	refused = await factory.create(repo.data.characterId, 1, root)
	check(refused.get("error") == "png_decode" and root.get_child_count() == child_count, "failed_native_decode_no_partial_fighter")
	print(JSON.stringify({"suite": "resources", "status": "passed", "assertions": assertions}))
	quit(0)

func start_create(factory: RefCounted, id: String, pending: Array) -> void:
	pending.append(await factory.create(id, 1, root))
