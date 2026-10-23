extends SceneTree
const Validator = preload("res://scripts/content/contract_validator.gd")
const ApiRepository = preload("res://scripts/content/api_character_repository.gd")
const FIXTURES := "res://../../packages/contracts/fixtures/"
var assertions := 0

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		print(JSON.stringify({"suite": "content", "status": "failed", "reason": label}))
		quit(1)
		assert(false, label)

func run() -> void:
	var vectors: Array = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES + "compatibility-v1.json"))
	var release_vectors: Array = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES + "compatibility-release-v1.json"))
	for vector in release_vectors:
		vector["kind"] = "release-index"
	vectors.append_array(release_vectors)
	for vector in vectors:
		var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES + vector.get("fixture", "sprout") + "/v1/character.json"))
		if vector.get("kind", "character") == "release-index":
			var id := "11111111-1111-4111-8111-111111111111"
			data = {"schemaVersion": 1, "releaseId": id, "characters": [{"characterId": id, "characterVersion": 1, "manifestPath": "characters/" + id + "/v1/character.json", "manifestSha256": "a".repeat(64)}]}
		for change in vector.changes:
			var target: Variant = data
			for key in change.path.slice(0, -1):
				target = target[int(key)] if target is Array else target[key]
			var key: Variant = change.path[-1]
			if target is Array:
				key = int(key)
			if change.get("remove", false):
				target.erase(key)
			else:
				target[key] = change.value
		if vector.has("assetChange"):
			data.assets.values()[0][vector.assetChange.field] = vector.assetChange.value
		if vector.has("repeat"):
			var collection: String = vector.repeat.collection
			var source: Variant = data[collection]
			data[collection] = [] if source is Array else {}
			for i in int(vector.repeat.count):
				if source is Array:
					data[collection].append(source[0].duplicate(true))
				else:
					data[collection]["asset-%d" % i] = source.values()[0].duplicate(true)
		check(Validator.validate(data, vector.get("kind", "character")).ok == vector.valid, vector.name)
	var finite_data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES + "sprout/v1/character.json"))
	finite_data.stats.moveSpeed = NAN
	check(not Validator.validate(finite_data, "character").ok, "nonfinite")
	finite_data.stats.moveSpeed = INF
	check(not Validator.validate(finite_data, "character").ok, "infinite")
	finite_data.stats.moveSpeed = 180
	finite_data.animations.idle.columns = 2
	finite_data.animations.idle.frameCount = 3
	finite_data.assets[finite_data.animations.idle.assetId].width = 512
	finite_data.assets[finite_data.animations.idle.assetId].height = 512
	check(Validator.validate(finite_data, "character").ok, "integer_row_rounding")
	check(not Validator.matches_schema(1, {"type": "number", "unknown": true}), "unknown_schema_keyword")
	var base := OS.get_environment("DOODLEFORGE_CONTENT_TEST_URL")
	check(not base.is_empty(), "test_server_required")
	var repo = ApiRepository.new(root, base)
	check(not (await repo.get_manifest("../secret", 1)).ok, "must_pin_first")
	var invalid = ApiRepository.new(root, "http://example.com")
	check(not (await invalid.list_characters()).ok, "non_loopback_refused")
	var pending: Array = []
	start_listing(repo, pending)
	check((await repo.list_characters()).get("error") == "busy", "single_inflight_request")
	while pending.is_empty():
		await process_frame
	var listing: Dictionary = pending[0]
	check(listing.ok, "list")
	var id: String = listing.value.characters[0].characterId
	var release_id: String = listing.value.releaseId
	listing.value.characters.clear()
	var again: Dictionary = await repo.list_characters()
	check(again.ok and again.value.releaseId == release_id and again.value.characters.size() == 1, "pinned_defensive_copy")
	check(not (await repo.refresh()).ok, "no_silent_refresh")
	check(not (await repo.get_manifest(id, 2)).ok, "unlisted_revision")
	var manifest: Dictionary = await repo.get_manifest(id, 1)
	check(manifest.ok, "manifest")
	var asset_id: String = manifest.value.assets.keys()[0]
	manifest.value.assets.clear()
	var ref := {"characterId": id, "characterVersion": 1, "assetId": asset_id}
	check((await repo.get_asset_bytes(ref)).ok, "asset_exact_bytes")
	check(not (await repo.get_asset_bytes({"url": "file:///etc/passwd"})).ok, "unsafe_reference")
	check(not (await repo.get_asset_bytes({"characterId": id, "characterVersion": 1, "assetId": "missing"})).ok, "undeclared_asset")
	for mode in ["hash", "identity", "unsupported", "oversize", "malformed", "redirect", "unavailable", "badpath", "duplicate", "indexlimit", "utf8", "assetcorrupt", "assetoversize", "dimensions"]:
		# Test origin stays loopback; the fixture server switches behavior via its port.
		var bad_repo = ApiRepository.new(root, OS.get_environment("DOODLEFORGE_CONTENT_TEST_" + mode.to_upper()))
		var result: Dictionary = await bad_repo.list_characters()
		if mode in ["hash", "identity", "unsupported", "assetcorrupt", "assetoversize", "dimensions"]:
			check(result.ok, mode + "_index")
			result = await bad_repo.get_manifest(id, 1)
			if mode.begins_with("asset") or mode == "dimensions":
				check(result.ok, mode + "_manifest")
				result = await bad_repo.get_asset_bytes(ref)
		check(not result.ok, mode + "_rejected")
	print(JSON.stringify({"suite": "content", "status": "passed", "assertions": assertions}))
	quit(0)

func start_listing(repo: RefCounted, pending: Array) -> void:
	pending.append(await repo.list_characters())
