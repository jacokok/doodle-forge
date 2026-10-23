extends SceneTree
const Arena = preload("res://scenes/main.tscn")
var assertions := 0
var base := OS.get_environment("DOODLEFORGE_PUBLISHED_API_URL")

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		print(JSON.stringify({"suite": "published_arena", "status": "failed", "reason": label}))
		quit(1)
		assert(false, label)

func settled(arena: Node) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while arena._loading and Time.get_ticks_msec() < deadline:
		await create_timer(0.01).timeout
	check(not arena._loading, "bounded_arena_load")

func control(action: String) -> void:
	# Test-only coordination, never a content source/proxy or production route.
	var request := HTTPRequest.new()
	root.add_child(request)
	request.timeout = 10
	check(request.request(OS.get_environment("DOODLEFORGE_ARENA_CONTROL") + "/" + action) == OK, "control_started")
	var response: Array = await request.request_completed
	check(response[0] == HTTPRequest.RESULT_SUCCESS and response[1] == 200, "control_" + action)
	request.queue_free()

func assert_release(arena: Node, release: String) -> void:
	check(arena.release_id == release and arena.player.get_meta("release_id") == release, "player_release_pinned")
	for enemy in arena.enemies:
		check(enemy.get_meta("release_id") == release and enemy.get_meta("character_version") == 1, "enemy_release_pinned")

func run() -> void:
	# This instance enters API mode via the actual user launch argument.
	var arena = Arena.instantiate()
	root.add_child(arena)
	arena.set_physics_process(false)
	check(arena.api_mode and arena.content_state == "discovering", "explicit_api_launch_discovery")
	check(arena.selection.disabled and arena.get_node("HUD/Start").disabled and arena.player == null, "discovery_controls_no_fixture")
	await settled(arena)
	check(arena.content_state == "ready" and arena.selection.item_count == 2, "published_arena_selectable_catalog")
	var release: String = arena.release_id
	var sprout_index := -1
	var comet_index := -1
	var images := []
	for index in arena.selection.item_count:
		arena.selection.item_selected.emit(index)
		check(arena._loading and arena.content_state == "loading" and arena.player == null, "selection_loading_no_partial_player")
		var held: int = arena.selected
		arena.refresh_catalog()
		check(arena.selected == held and arena._loading, "refresh_rejected_during_selection_load")
		arena.select_character(1 - index)
		arena.start_run()
		arena.maintain_waves()
		check(arena.selected == held and not arena.running and arena.get_node("Actors").get_child_count() == 0, "overlapping_actions_rejected")
		await settled(arena)
		var player = arena.player
		check(player.scene_file_path == "res://scenes/fighter.tscn" and player.get_meta("character_version") == 1, "selection_generic_factory")
		check(arena.health_bar.value == player.health and arena.health_bar.max_value == player.maximum_health, "selection_hud")
		if player.get_meta("character_name") == "Sprout":
			sprout_index = index
		else:
			comet_index = index
		var frames: SpriteFrames = player.sprite.sprite_frames
		check(frames.get_animation_names().size() == 5 and frames.get_frame_texture("walk", 0).atlas is ImageTexture, "selection_runtime_resources")
		images.append(frames.get_frame_texture("idle", 0).atlas.get_image().get_data())
		await physics_frame
		var origin: Vector2 = player.position
		Input.action_press("move_right")
		arena._physics_process(1.0 / 60.0)
		Input.action_release("move_right")
		check(player.position.x > origin.x and player.sprite.animation == "walk", "selected_player_arena_input")
		player.jump()
		origin = player.position
		arena._physics_process(0.1)
		check(player.position == origin and player.elevation > 0 and player.pivot.position.y == -player.elevation, "selected_player_jump_separation")
		assert_release(arena, release)
	check(sprout_index >= 0 and comet_index >= 0 and images[0] != images[1], "both_existing_fixture_art_discovered")
	var held_player = arena.player
	await arena.select_character(-1)
	await arena.select_character(arena.selection.item_count)
	check(arena.player == held_player and arena.content_state == "ready", "unlisted_selection_ignored")
	await arena.select_character(sprout_index)
	# Advance real publication while this arena retains its original full snapshot.
	await control("advance")
	await arena.start_run()
	check(arena.running and arena.spawned == 2 and arena.enemies.size() == 2, "api_initial_wave_cap")
	var active_player = arena.player
	arena.refresh_catalog()
	check(arena._loading == false and arena.player == active_player and arena.release_id == release, "refresh_rejected_during_match")
	check(arena.player.maximum_health == 100 and arena.player.get_meta("character_version") == 1, "reset_keeps_old_revision_after_publication")
	assert_release(arena, release)
	var enemy = arena.enemies[0]
	arena.player.position = Vector2(400, 360)
	enemy.position = Vector2(460, 360)
	var hp: int = enemy.health
	arena.player.begin_attack()
	arena.player.sprite.sprite_frames.set_animation_speed("attack_light", 60)
	arena.player.tick_combat(0.05, [enemy])
	check(enemy.health == hp, "arena_combat_startup")
	arena.player.tick_combat(0.06, [enemy])
	check(enemy.health == hp - int(arena.player.attack.damage), "arena_combat_independent_of_art")
	arena.player.tick_combat(0.01, [enemy])
	check(enemy.health == hp - int(arena.player.attack.damage), "arena_combat_dedup")
	arena.player.take_damage(1)
	check(arena.health_bar.value == arena.player.health, "api_damage_hud_binding")
	for wave_index in 2:
		while arena.running and arena.wave == wave_index:
			for target in arena.enemies:
				target.take_damage(10000)
			arena.maintain_waves()
			if arena._loading:
				var held_selection: int = arena.selected
				var origin: Vector2 = arena.player.position
				arena.select_character(comet_index)
				arena.start_run()
				Input.action_press("move_right")
				arena._physics_process(1.0 / 60.0)
				Input.action_release("move_right")
				check(arena.selected == held_selection and arena.player.position == origin, "wave_load_blocks_reset_selection_and_input")
				await settled(arena)
			if arena.running:
				check(arena.enemies.size() <= arena.ACTIVE_CAP, "api_wave_refill_cap")
				assert_release(arena, release)
	check(arena.completed and not arena.running and arena.enemies.is_empty(), "api_waves_complete")
	await arena.start_run()
	arena.player.take_damage(10000)
	arena._physics_process(1.0 / 60.0)
	check(not arena.running and not arena.completed, "api_loss_stops_waves")
	# Corrupt a real ready Comet asset: player succeeds, enemy fails, all cleared.
	await control("corrupt")
	await arena.start_run()
	check(arena.content_state == "error" and arena.content_error == "http_503" and not arena.running, "real_enemy_failure_explicit")
	check(arena.player == null and arena.enemies.is_empty() and arena.get_node("Actors").get_child_count() == 0 and arena.health_bar.value == 0, "failed_wave_no_partial_match_or_fallback")
	check(not arena.selection.disabled and not arena.get_node("HUD/Start").disabled, "failure_controls_recoverable")
	await arena.select_character(comet_index)
	check(arena.content_state == "error" and arena.player == null, "real_player_failure_no_fallback")
	await control("restore")
	await arena.start_run()
	check(arena.running and arena.content_state == "ready", "explicit_retry_recovers_same_release")
	assert_release(arena, release)
	await arena.select_character(sprout_index)
	check(not arena.running and arena.enemies.is_empty() and arena.player.health == 100, "selection_resets_match_after_failure")
	assert_release(arena, release)
	# Explicit refresh is accepted only at a safe boundary and installs one coherent new release.
	await arena.refresh_catalog()
	check(arena.release_id != release and arena.player.get_meta("release_id") == arena.release_id, "manual_refresh_atomic_release_replacement")
	check(arena.player.get_meta("character_id") == "11111111-1111-4111-8111-111111111111" and arena.player.get_meta("character_version") == 2, "refresh_reconciles_selection_by_id")
	check(arena.selection.item_count == 2 and arena.content_state == "ready", "refresh_replaces_catalog_after_resources_ready")
	var retained_player: Node = arena.player
	var retained_release: String = arena.release_id
	await control("corrupt-index")
	await arena.refresh_catalog()
	check(arena.player == retained_player and arena.release_id == retained_release and arena.selection.item_count == 2, "failed_refresh_retains_coherent_old_state")
	check(arena.content_error == "http_503" and arena.status.text.contains("previous catalog retained"), "failed_refresh_explicit_error")
	await control("restore-index")
	# A separate new arena also sees the current publication.
	var fresh = Arena.instantiate()
	root.add_child(fresh)
	fresh.set_physics_process(false)
	await settled(fresh)
	check(fresh.release_id != release and fresh.selection.item_count == 2, "new_arena_observes_new_publication")
	await fresh.select_character(sprout_index)
	check(fresh.player.maximum_health == 137 and fresh.player.get_meta("character_version") == 2, "new_arena_new_revision_only")
	assert_release(arena, arena.release_id)
	await control("corrupt-index")
	var bad = Arena.instantiate()
	root.add_child(bad)
	bad.set_physics_process(false)
	await settled(bad)
	check(bad.content_state == "error" and bad.content_error == "http_503" and bad.player == null and bad.selection.item_count == 0, "discovery_failure_no_fixture_catalog")
	check(bad.selection.disabled and not bad.get_node("HUD/Start").disabled, "failed_discovery_can_retry")
	await control("restore-index")
	await bad.start_run()
	check(bad.content_state == "ready" and bad.selection.item_count == 2 and bad.player != null, "discovery_retry_recovers")
	# Do not destroy the HTTPRequest signal emitter's owning repository in its
	# completion stack; production also keeps the arena alive across loads.
	bad.queue_free()
	fresh.queue_free()
	arena.queue_free()
	await process_frame
	print(JSON.stringify({"suite": "published_arena", "status": "passed", "assertions": assertions}))
	quit(0)
