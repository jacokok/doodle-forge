extends SceneTree
const Arena = preload("res://scenes/main.tscn")
var assertions := 0

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		print(JSON.stringify({"suite": "published_addition", "status": "failed", "reason": label}))
		quit(1)
		assert(false, label)

func control(action: String) -> void:
	var request := HTTPRequest.new()
	root.add_child(request)
	request.timeout = 10
	check(request.request(OS.get_environment("DOODLEFORGE_ARENA_CONTROL") + "/" + action) == OK, "control_started")
	var response: Array = await request.request_completed
	check(response[0] == HTTPRequest.RESULT_SUCCESS and response[1] == 200, "control_" + action)
	request.queue_free()

func settled(arena: Node) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while arena._loading and Time.get_ticks_msec() < deadline:
		await create_timer(0.01).timeout
	check(not arena._loading, "bounded_arena_load")

func run() -> void:
	var arena = Arena.instantiate()
	root.add_child(arena)
	arena.set_physics_process(false)
	var deadline := Time.get_ticks_msec() + 10000
	while arena._loading and Time.get_ticks_msec() < deadline:
		await create_timer(0.01).timeout
	check(arena.content_state == "ready" and arena.selection.item_count == 1, "initial_catalog_contains_only_sprout")
	check(arena.player.get_meta("character_name") == "Sprout", "initial_character_playable")
	var initial_release: String = arena.release_id

	# Publish a second approved fixture through the real publisher after discovery.
	await control("add-comet")
	check(arena.selection.item_count == 1 and arena.release_id == initial_release, "old_catalog_unchanged_until_candidate_activation")
	# Exercise the exact production polling/candidate-refresh path without waiting five seconds.
	await arena._poll_catalog()
	check(arena.content_state == "ready" and arena.selection.item_count == 2, "poll_discovers_new_catalog_member")
	check(arena.release_id != initial_release, "candidate_release_activated")
	var comet_index := -1
	for index in arena._entries.size():
		if arena._entries[index].characterId == "22222222-2222-4222-8222-222222222222":
			comet_index = index
	check(comet_index >= 0, "new_character_selectable_by_data")
	await arena.select_character(comet_index)
	check(arena.player.get_meta("character_name") == "Comet" and arena.player.scene_file_path == "res://scenes/fighter.tscn" and arena.selection.get_item_text(comet_index).contains("Comet"), "new_character_uses_generic_fighter")
	var player = arena.player
	var initial_position: Vector2 = player.position
	player.step(1.0 / 60.0, Vector2.RIGHT, [])
	check(player.position.x > initial_position.x, "new_character_moves_without_character_script")
	await arena.start_run()
	check(arena.running and arena.enemies.size() == 2 and arena.enemies[0].get_meta("character_name") == "Sprout", "new_character_plays_in_arena")
	player = arena.player
	var enemy = arena.enemies[0]
	player.position = Vector2(400, 360)
	enemy.position = Vector2(460, 360)
	var hp: int = enemy.health
	player.begin_attack()
	player.tick_combat(0.05, [enemy])
	player.tick_combat(0.06, [enemy])
	check(enemy.health < hp, "new_character_combat_data_works")
	check(player.get_meta("release_id") == arena.release_id and enemy.get_meta("release_id") == arena.release_id, "added_catalog_members_share_pinned_release")
	arena.queue_free()
	await process_frame
	print(JSON.stringify({"suite": "published_addition", "status": "passed", "assertions": assertions}))
	quit(0)
