extends RefCounted
# Only the keywords emitted by the shared v1 Zod schemas are supported.
# Unknown schema keywords fail closed rather than silently weakening validation.
const SCHEMA_ROOT := "res://../../packages/contracts/schema/"
const KEYWORDS := ["$schema", "type", "properties", "required", "additionalProperties", "propertyNames", "items", "maxItems", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "const", "enum", "pattern", "format", "anyOf"]
const REQUIRED := ["idle", "walk", "attack_light", "hurt", "knockout"]
const OPTIONAL := ["jump", "attack_heavy", "special"]

static func matches_schema(value: Variant, schema: Dictionary) -> bool:
	for key in schema:
		if key not in KEYWORDS:
			return false
	if schema.has("anyOf"):
		for option in schema.anyOf:
			if matches_schema(value, option):
				return true
		return false
	match schema.get("type", ""):
		"object":
			if not value is Dictionary:
				return false
			for key in schema.get("required", []):
				if not value.has(key):
					return false
			for key in value:
				if schema.has("propertyNames") and not matches_schema(key, schema.propertyNames):
					return false
				if schema.get("properties", {}).has(key):
					if not matches_schema(value[key], schema.properties[key]):
						return false
				else:
					var extra: Variant = schema.get("additionalProperties", true)
					if extra is bool:
						if not extra:
							return false
					elif not matches_schema(value[key], extra):
						return false
		"array":
			if not value is Array or value.size() > schema.get("maxItems", 2147483647):
				return false
			for item in value:
				if not matches_schema(item, schema.items):
					return false
		"string":
			if not value is String:
				return false
			# Pinned Zod 4.6.7 length checks count Unicode code points.
			var length: int = value.length()
			if length < schema.get("minLength", 0) or length > schema.get("maxLength", 2147483647):
				return false
			if schema.has("pattern"):
				var regex := RegEx.new()
				if regex.compile(schema.pattern) != OK or regex.search(value) == null:
					return false
			if schema.has("format") and schema.format != "uuid":
				return false
		"number", "integer":
			if not (value is float or value is int) or not is_finite(float(value)):
				return false
			if schema.type == "integer" and (floor(float(value)) != float(value) or abs(float(value)) > 9007199254740991.0):
				return false
			if value < schema.get("minimum", -INF) or value > schema.get("maximum", INF) or (schema.has("exclusiveMinimum") and value <= schema.exclusiveMinimum):
				return false
		"boolean":
			if not value is bool:
				return false
		_:
			return false
	if schema.has("const") and value != schema.const:
		return false
	if schema.has("enum") and value not in schema.enum:
		return false
	return true

static func safe_path(value: String) -> bool:
	# The separate shared isSafeAssetPath helper uses JavaScript string.length.
	if value.to_utf16_buffer().size() / 2 > 256 or value.contains("\\") or value.begins_with("/"):
		return false
	for i in value.length():
		# Godot replaces JSON NUL with U+FFFD. Neither is accepted in paths.
		if value.unicode_at(i) in [0, 65533]:
			return false
	var drive := RegEx.new()
	drive.compile("^[A-Za-z]:")
	if drive.search(value) != null:
		return false
	for part in value.split("/"):
		if part in ["", ".", ".."]:
			return false
	return true

static func manifest_path(entry: Dictionary) -> String:
	return "characters/%s/v%d/character.json" % [entry.characterId, entry.characterVersion]

static func validate(value: Variant, kind: String) -> Dictionary:
	if kind not in ["character", "release-index"]:
		return {"ok": false, "error": "unsupported_contract"}
	var schema: Variant = JSON.parse_string(FileAccess.get_file_as_string(SCHEMA_ROOT + kind + "-v1.schema.json"))
	if not schema is Dictionary:
		return {"ok": false, "error": "schema_unavailable"}
	# Zod trims these two public fields before checking their lengths.
	if value is Dictionary and kind == "character":
		value = value.duplicate(true)
		for field in ["name", "description"]:
			if value.get(field) is String:
				var trim := RegEx.new()
				trim.compile("^[\\x{0009}-\\x{000D}\\x{0020}\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}]+|[\\x{0009}-\\x{000D}\\x{0020}\\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}]+$")
				value[field] = trim.sub(value[field], "", true)
	if not matches_schema(value, schema):
		return {"ok": false, "error": "invalid_structure"}
	var error := semantics(value, kind)
	if not error.is_empty():
		return {"ok": false, "error": error}
	return {"ok": true, "value": value}

static func unique_ids(items: Array, key: String = "id") -> bool:
	var seen := {}
	for item in items:
		if seen.has(item[key]):
			return false
		seen[item[key]] = true
	return true

static func semantics(m: Dictionary, kind: String) -> String:
	if kind == "release-index":
		if not unique_ids(m.characters, "characterId"):
			return "duplicate_character"
		for entry in m.characters:
			if entry.manifestPath != manifest_path(entry):
				return "invalid_manifest_path"
		return ""
	if m.animations.size() > 8 or m.assets.size() > 128:
		return "map_limit"
	for required in REQUIRED:
		if not m.animations.has(required):
			return "missing_animation"
	for name in m.animations:
		var a: Dictionary = m.animations[name]
		if (name not in REQUIRED and name not in OPTIONAL) or not m.assets.has(a.assetId):
			return "invalid_animation_reference"
		var asset: Dictionary = m.assets[a.assetId]
		if asset.width != a.columns * a.frameWidth or asset.height != ceil(float(a.frameCount) / float(a.columns)) * a.frameHeight:
			return "sheet_dimensions"
		if a.loop != (name in ["idle", "walk"]):
			return "animation_loop"
	for collection in ["attacks", "hitboxes", "hurtboxes", "abilities", "effects"]:
		if not unique_ids(m[collection]):
			return "duplicate_id"
	var hitboxes := {}
	var attacks := {}
	var effects := {}
	for box in m.hitboxes:
		hitboxes[box.id] = true
	for attack in m.attacks:
		attacks[attack.id] = true
		if not m.animations.has(attack.animation):
			return "attack_animation"
		for id in attack.hitboxIds:
			if not hitboxes.has(id):
				return "attack_hitbox"
	for effect in m.effects:
		effects[effect.id] = true
		if not m.assets.has(effect.assetId):
			return "effect_asset"
	for ability in m.abilities:
		if not attacks.has(ability.attackId):
			return "ability_attack"
		for id in ability.effectIds:
			if not effects.has(id):
				return "ability_effect"
	for box in m.hitboxes + m.hurtboxes:
		if box.maxElevation < box.minElevation:
			return "box_elevation"
	for asset in m.assets.values():
		if not safe_path(asset.path):
			return "unsafe_asset_path"
	return ""
