extends SceneTree
const ApiRepository = preload("res://scripts/content/api_character_repository.gd")
const Factory = preload("res://scripts/content/character_factory.gd")
var assertions := 0

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		print(JSON.stringify({"suite": "published_api", "status": "failed", "reason": label}))
		quit(1)
		assert(false, label)

func run() -> void:
	var base := OS.get_environment("DOODLEFORGE_PUBLISHED_API_URL")
	check(not base.is_empty(), "real_studio_required")
	var repo = ApiRepository.new(root, base)
	var listing: Dictionary = await repo.list_characters()
	check(listing.ok and listing.value.characters.size() == 2, "published_full_release")
	var release_id: String = listing.value.releaseId
	var factory := Factory.new(repo)
	var fighters := []
	for entry in listing.value.characters:
		var made := await factory.create(entry.characterId, int(entry.characterVersion), root)
		check(made.ok, "real_api_factory")
		var fighter = made.value
		fighters.append(fighter)
		check(fighter.scene_file_path == "res://scenes/fighter.tscn" and fighter.get_meta("release_id") == release_id, "generic_scene_pinned_release")
		var manifest: Dictionary = (await repo.get_manifest(entry.characterId, int(entry.characterVersion))).value
		check(fighter.maximum_health == manifest.stats.health and fighter.move_speed == manifest.stats.moveSpeed, "published_stats")
		for animation in manifest.animations:
			var definition: Dictionary = manifest.animations[animation]
			var frames: SpriteFrames = fighter.sprite.sprite_frames
			check(frames.get_frame_count(animation) == definition.frameCount and frames.get_animation_speed(animation) == definition.fps and frames.get_animation_loop(animation) == definition.loop, "published_animation_" + animation)
			var texture: AtlasTexture = frames.get_frame_texture(animation, 0)
			check(texture.atlas is ImageTexture and texture.get_image().get_size() == Vector2i(256, 256), "runtime_texture_" + animation)
		check(fighter.sprite.position == Vector2(-128, -224), "published_anchor")
	check(fighters[0].sprite.sprite_frames.get_frame_texture("idle", 0).atlas.get_image().get_data() != fighters[1].sprite.sprite_frames.get_frame_texture("idle", 0).atlas.get_image().get_data(), "distinct_published_art")
	await physics_frame
	for i in 2:
		var player = fighters[i]
		var enemy = fighters[1 - i]
		player.team = 0
		enemy.team = 1
		player.position = Vector2(400, 360)
		enemy.position = Vector2(460, 360)
		var origin: Vector2 = player.position
		player.step(1.0 / 60.0, Vector2.RIGHT, [])
		check(is_equal_approx(player.position.x - origin.x, player.move_speed / 60.0) and player.sprite.animation == "walk", "api_fighter_moves")
		player.jump()
		origin = player.position
		player.step(0.1, Vector2.ZERO, [])
		check(player.elevation > 0 and player.position == origin and player.pivot.position.y == -player.elevation, "api_jump_separation")
		for tick in 90:
			player.step(1.0 / 60.0, Vector2.ZERO, [])
		player.begin_attack()
		var hp: int = enemy.health
		var startup: float = player.attack.startupSeconds
		player.tick_combat(startup * 0.5, [enemy])
		check(enemy.health == hp, "api_startup_no_damage")
		# Change art FPS; timing remains entirely manifest combat driven.
		player.sprite.sprite_frames.set_animation_speed("attack_light", 60)
		player.tick_combat(startup * 0.5 + 0.001, [enemy])
		check(enemy.health == hp - int(player.attack.damage), "api_timed_melee")
		player.tick_combat(0.01, [enemy])
		check(enemy.health == hp - int(player.attack.damage), "api_hit_dedup")
		player.tick_combat(1.0, [])
		enemy.step(1.0, Vector2.ZERO, [])
		player.step(1.0, Vector2.ZERO, [])
	var before := root.get_child_count()
	check(not (await factory.create(listing.value.characters[0].characterId, 2, root)).ok and root.get_child_count() == before, "unpublished_revision_not_spawned")
	check((await repo.list_characters()).value.releaseId == release_id, "release_never_swapped")
	for fighter in fighters:
		fighter.free()
	print(JSON.stringify({"suite": "published_api", "status": "passed", "assertions": assertions}))
	quit(0)
