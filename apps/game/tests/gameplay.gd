extends SceneTree

func _initialize() -> void:
	var fighter_script = load("res://scripts/fighter.gd")
	var player = fighter_script.new()
	var enemy = fighter_script.new()
	root.add_child(player)
	root.add_child(enemy)
	await physics_frame
	player.position = Vector2.ZERO
	enemy.position = Vector2(90, 0)
	player.team = 0
	enemy.team = 1
	var fixture_path := "res://../../packages/contracts/fixtures/sprout/v1/character.json"
	var file := FileAccess.open(fixture_path, FileAccess.READ)
	if file == null:
		fail("fixture_unavailable")
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary or not player.load_character_data(parsed):
		fail("fixture_load_failed")
		return
	var origin: Vector2 = player.global_position
	player.set_move_intent(Vector2(1, 1), 1.0 / 60.0)
	if player.global_position == origin:
		fail("movement_failed")
		return
	var ground_position: Vector2 = player.global_position
	player.jump()
	player._step_jump(0.1)
	if player.elevation <= 0.0 or player.global_position != ground_position:
		fail("jump_ground_separation_failed")
		return
	player.elevation = 0.0
	player.begin_attack()
	var opponents: Array[Node] = [enemy]
	player.tick_combat(0.11, opponents)
	if enemy.health != 90:
		fail("attack_damage_failed")
		return
	player.tick_combat(0.05, opponents)
	if enemy.health != 90:
		fail("attack_deduplication_failed")
		return
	print('{"suite":"gameplay","status":"passed","assertions":5}')
	quit(0)

func fail(reason: String) -> void:
	print(JSON.stringify({"suite": "gameplay", "status": "failed", "reason": reason}))
	quit(1)
