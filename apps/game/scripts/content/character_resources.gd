extends RefCounted
# Per-load budgets, not a global cache or GPU-memory accounting system.
const Validator = preload("res://scripts/content/contract_validator.gd")
const ENCODED_LIMIT := 32 * 1024 * 1024
const WORKING_LIMIT := 128 * 1024 * 1024
# Conservatively charge native decode (up to RGBA16), RGBA8 conversion and upload.
const BYTES_PER_PIXEL := 16

static func error(code: String) -> Dictionary:
	return {"ok": false, "error": code}

static func preflight(data: Dictionary) -> Dictionary:
	var validated := Validator.validate(data, "character")
	if not validated.ok:
		return validated
	var encoded := 0
	var working := 0
	for asset in data.assets.values():
		encoded += int(asset.bytes)
		working += int(asset.width) * int(asset.height) * BYTES_PER_PIXEL
	if encoded > ENCODED_LIMIT or working > WORKING_LIMIT:
		return error("character_resource_limit")
	return {"ok": true}

static func decode(bytes: PackedByteArray, asset: Dictionary) -> Dictionary:
	# Recheck before calling the native decoder, including actual IHDR dimensions.
	if bytes.size() != asset.bytes or bytes.size() > 16777216:
		return error("asset_integrity")
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	if hash.finish().hex_encode() != asset.sha256:
		return error("asset_integrity")
	if bytes.size() < 33 or bytes.slice(0, 8) != PackedByteArray([137, 80, 78, 71, 13, 10, 26, 10]) or bytes.slice(8, 16) != PackedByteArray([0, 0, 0, 13, 73, 72, 68, 82]):
		return error("png_header")
	var width := bytes[16] * 16777216 + bytes[17] * 65536 + bytes[18] * 256 + bytes[19]
	var height := bytes[20] * 16777216 + bytes[21] * 65536 + bytes[22] * 256 + bytes[23]
	if width < 1 or height < 1 or width > 4096 or height > 4096 or width != asset.width or height != asset.height or width * height * BYTES_PER_PIXEL > WORKING_LIMIT:
		return error("png_dimensions_or_limit")
	# Refuse animation/multipage and malformed/trailing containers, not just IHDR.
	var offset := 33
	var has_data := false
	var ended := false
	var chunks := 0
	while offset + 12 <= bytes.size():
		chunks += 1
		if chunks > 4096:
			return error("png_chunks")
		var length := bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]
		if length > bytes.size() - offset - 12:
			return error("png_chunks")
		var kind := bytes.slice(offset + 4, offset + 8).get_string_from_ascii()
		if kind in ["acTL", "fcTL", "fdAT", "IHDR"]:
			return error("png_chunks")
		# No compressed text/profiles or unknown ancillary payloads in game art.
		# Their expanded size is unrelated to the bounded image dimensions.
		var ancillary_limits := {"PLTE": 768, "tRNS": 256, "pHYs": 9, "sRGB": 1, "gAMA": 4, "cHRM": 32}
		if kind not in ["IDAT", "IEND"] and (not ancillary_limits.has(kind) or length > ancillary_limits[kind]):
			return error("png_unsupported_chunk")
		has_data = has_data or kind == "IDAT"
		offset += length + 12
		if kind == "IEND":
			ended = length == 0 and offset == bytes.size()
			break
	if not ended or not has_data:
		return error("png_chunks")
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK or image.is_empty():
		return error("png_decode")
	if image.get_width() != width or image.get_height() != height or image.has_mipmaps():
		return error("png_decoded_dimensions")
	image.convert(Image.FORMAT_RGBA8)
	var texture := ImageTexture.create_from_image(image)
	if texture == null:
		return error("texture_creation")
	return {"ok": true, "value": texture}

static func build(repository: RefCounted, data: Dictionary) -> Dictionary:
	# Freeze the load inputs across awaits even for direct resource-builder callers.
	data = data.duplicate(true)
	var checked := preflight(data)
	if not checked.ok:
		return checked
	var textures := {}
	# Serial fetching/decoding; do not retain encoded buffers after each iteration.
	for id in data.assets:
		var response: Dictionary = await repository.get_asset_bytes({"characterId": data.characterId, "characterVersion": int(data.characterVersion), "assetId": id})
		if not response.ok:
			return response
		var decoded := decode(response.value, data.assets[id])
		if not decoded.ok:
			return decoded
		textures[id] = decoded.value
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for name in data.animations:
		var animation: Dictionary = data.animations[name]
		frames.add_animation(name)
		frames.set_animation_speed(name, float(animation.fps))
		frames.set_animation_loop(name, animation.loop)
		for index in int(animation.frameCount):
			var atlas := AtlasTexture.new()
			atlas.atlas = textures[animation.assetId]
			atlas.region = Rect2((index % int(animation.columns)) * int(animation.frameWidth), floori(float(index) / int(animation.columns)) * int(animation.frameHeight), animation.frameWidth, animation.frameHeight)
			frames.add_frame(name, atlas)
	return {"ok": true, "value": {"frames": frames, "textures": textures}}
