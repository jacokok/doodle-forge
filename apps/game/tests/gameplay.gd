extends SceneTree

const Fixtures = preload("res://scripts/fixtures.gd")
const Brain = preload("res://scripts/enemy_brain.gd")
var assertions := 0
var failures: Array[String] = []

func check(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		failures.append(label)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var arena = load("res://scenes/main.tscn").instantiate()
	root.add_child(arena)
	arena.set_physics_process(false)
	var player = arena.player
	var enemy = Fixtures.create(1, arena.get_node("Actors"))
	enemy.team = 1
	await physics_frame
	check(player.move_speed == 180 and enemy.move_speed == 180, "fixture speeds")
	check(player.get_meta("character_name") != enemy.get_meta("character_name"), "two fixtures")
	check(arena.get_node("Actors").y_sort_enabled, "ground Y sort")
	check(player.sprite.sprite_frames.get_animation_names().size() == 5, "five animations")
	check(player.sprite.position == Vector2(-128, -224), "foot anchor")
	var texture_a = player.sprite.sprite_frames.get_frame_texture("idle", 0).atlas.get_image()
	var texture_b = enemy.sprite.sprite_frames.get_frame_texture("idle", 0).atlas.get_image()
	check(texture_a.get_data() != texture_b.get_data(), "distinct real PNG art")
	for action in ["move_left", "move_right", "move_up", "move_down", "jump", "light_attack"]:
		check(InputMap.action_get_events(action).size() > 0, "bound " + action)
	Input.action_press("move_right")
	var origin: Vector2 = player.position
	arena._physics_process(1.0 / 60.0)
	Input.action_release("move_right")
	check(player.position.x > origin.x, "input through arena")
	origin = player.position
	player.step(1.0 / 60.0, Vector2.ONE, [])
	check(is_equal_approx(player.velocity.length(), player.move_speed), "diagonal normalization")
	check(is_equal_approx(player.position.distance_to(origin), 3.0), "speed displacement")
	enemy.position = Vector2(600, 360)
	var second_origin: Vector2 = enemy.position
	enemy.step(1.0 / 60.0, Vector2.LEFT, [])
	check(is_equal_approx(enemy.position.distance_to(second_origin), 3.0), "second fixture movement")
	check(player.sprite.animation == "walk" and enemy.sprite.animation == "walk", "walk animation selection")
	player.jump()
	origin = player.position
	player.step(0.1, Vector2.ZERO, [])
	check(player.elevation > 0 and player.position == origin, "jump root separation")
	check(player.pivot.position.y == -player.elevation and player.shadow.position == Vector2.ZERO and player.shadow.scale.x < 1, "jump visual and shadow")
	player.begin_attack()
	check(player.state == "jump", "ground-only light")
	for tick in 90:
		player.step(1.0 / 60.0, Vector2.ZERO, [])
	check(player.elevation == 0 and player.state == "idle", "landing")
	player.position = Vector2(400, 360)
	enemy.position = Vector2(460, 360)
	player.facing = 1
	var targets: Array[Node] = [enemy]
	player.begin_attack()
	player.tick_combat(0.09, targets)
	check(enemy.health == enemy.maximum_health, "startup cannot hit")
	player.tick_combat(0.02, targets)
	check(enemy.health == enemy.maximum_health - 10 and enemy.state == "hurt", "active damage and hurt")
	player.tick_combat(0.05, targets)
	check(enemy.health == enemy.maximum_health - 10, "deduplication")
	player.step(0.01, Vector2.RIGHT, [])
	check(player.velocity == Vector2.ZERO, "attack blocks movement")
	check(player.sprite.animation == "attack_light", "attack animation selection")
	var enemy_origin: Vector2 = enemy.position
	enemy.step(0.05, Vector2.ZERO, [])
	check(enemy.position.x > enemy_origin.x, "knockback displacement")
	enemy.step(0.3, Vector2.ZERO, [])
	check(enemy.state == "idle", "hurt recovery")
	player.tick_combat(1.0, [])
	player.begin_attack()
	check(player.state == "idle", "cooldown guard")
	player.step(1.0, Vector2.ZERO, [])
	enemy.position = Vector2(460, 360)
	enemy.team = 0
	check(not player.can_hit(enemy), "team filter")
	enemy.team = 1
	enemy.position.y = 500
	check(not player.can_hit(enemy), "depth miss")
	enemy.position = Vector2(460, 360)
	enemy.elevation = 41
	check(not player.can_hit(enemy), "elevation miss")
	enemy.elevation = 0
	enemy.position.x = 340
	check(not player.can_hit(enemy), "behind miss")
	player.facing = -1
	check(player.can_hit(enemy), "mirrored boxes")
	player.update_visuals()
	check(player.pivot.scale.x == -1, "mirrored art")
	player.facing = 1
	enemy.position.x = 460
	player.begin_attack()
	var saved_frames: SpriteFrames = player.sprite.sprite_frames
	player.sprite.sprite_frames = SpriteFrames.new()
	player.tick_combat(1.0, targets)
	check(enemy.health == enemy.maximum_health - 20, "whole-window overlap and art-independent combat")
	player.sprite.sprite_frames = saved_frames
	player.step(0.6, Vector2.ZERO, [])
	player.begin_attack()
	enemy.position.x = 850
	player.tick_combat(0.26, targets)
	enemy.position.x = 460
	var health_before: int = enemy.health
	player.tick_combat(0.01, targets)
	check(enemy.health == health_before, "recovery cannot hit late entrant")
	player.take_damage(1)
	check(arena.health_bar.value == player.health, "signal-bound HUD")
	player.state = "attack"
	player.take_damage(1)
	check(player.state == "hurt", "hurt interrupts attack")
	var ko_count := [0]
	enemy.knocked_out.connect(func(): ko_count[0] += 1)
	enemy.take_damage(10000)
	enemy.take_damage(10000)
	enemy.jump()
	enemy.begin_attack()
	check(enemy.health == 0 and enemy.state == "knockout" and ko_count[0] == 1, "terminal one-shot KO")
	enemy.update_visuals()
	check(enemy.sprite.animation == "knockout" and not enemy.sprite.sprite_frames.get_animation_loop("knockout"), "nonlooping KO animation")
	enemy.free()
	arena.select_character(1)
	check(arena.player.get_meta("character_name") == "Comet" and arena.health_bar.max_value == arena.player.maximum_health, "selection reconfigures fighter and HUD")
	arena.player.position = Vector2(900, 490)
	arena.player.step(0.1, Vector2.ONE, [])
	check(arena.player.position == Vector2(900, 490), "arena bounds")
	arena.start_run()
	check(arena.enemies.size() == 2 and arena.spawned == 2, "initial bounded wave")
	var bot = arena.enemies[0]
	check(Brain.intent(bot, arena.player).x < 0, "AI approaches")
	bot.position = arena.player.position + Vector2(60, 0)
	var intent: Vector2 = Brain.intent(bot, arena.player)
	check(intent == Vector2.ZERO and bot.state == "attack", "AI attacks in range")
	bot.tick_combat(0.11, [arena.player])
	check(arena.player.health < arena.player.maximum_health, "AI damages player")
	var defeated := 0
	for tick in 10:
		if not arena.running:
			break
		check(arena.enemies.size() <= arena.ACTIVE_CAP, "active cap")
		for target in arena.enemies:
			# Controlled combat integration: defeat each fixture with normal melee,
			# not direct damage/KO. AI is tested separately above.
			arena.player.position = target.position - Vector2(60, 0)
			arena.player.facing = 1
			for swing in 12:
				if target.state == "knockout":
					break
				arena.player.step(0.6, Vector2.ZERO, [])
				arena.player.begin_attack()
				arena.player.tick_combat(0.11, [target])
				arena.player.tick_combat(0.5, [])
			check(target.state == "knockout", "player melee defeats wave enemy")
			defeated += 1
		arena.maintain_waves()
	check(defeated == 5 and arena.completed and not arena.running, "all bounded waves complete")
	arena.start_run()
	arena.player.take_damage(10000)
	arena._physics_process(1.0 / 60.0)
	check(not arena.running and not arena.completed, "player loss stops waves")
	arena.free()
	await process_frame
	print(JSON.stringify({"suite": "gameplay", "status": "passed" if failures.is_empty() else "failed", "assertions": assertions, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
