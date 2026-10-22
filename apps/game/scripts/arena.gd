extends Node2D

const Fixtures = preload("res://scripts/fixtures.gd")
const Brain = preload("res://scripts/enemy_brain.gd")
const WAVES := [2, 3]
const ACTIVE_CAP := 2
var player
var enemies: Array[Node] = []
var selected := 0
var wave := 0
var spawned := 0
var running := false
var completed := false
@onready var status: Label = $HUD/Status
@onready var health_bar: ProgressBar = $HUD/Health
@onready var selection: OptionButton = $HUD/Selection

func _ready() -> void:
	for definition in [["move_left", KEY_A, KEY_LEFT], ["move_right", KEY_D, KEY_RIGHT], ["move_up", KEY_W, KEY_UP], ["move_down", KEY_S, KEY_DOWN], ["jump", KEY_SPACE], ["light_attack", KEY_J]]:
		if not InputMap.has_action(definition[0]):
			InputMap.add_action(definition[0])
			for key in definition.slice(1):
				var event := InputEventKey.new()
				event.physical_keycode = key
				InputMap.action_add_event(definition[0], event)
	selection.add_item("Sprout")
	selection.add_item("Comet")
	selection.item_selected.connect(select_character)
	$HUD/Start.pressed.connect(start_run)
	for argument in OS.get_cmdline_user_args():
		if argument == "--fixture=comet":
			selected = 1
	selection.select(selected)
	select_character(selected)

func select_character(index: int) -> void:
	selection.release_focus()
	$HUD/Start.release_focus()
	selected = index
	running = false
	completed = false
	for enemy in enemies:
		enemy.free()
	enemies.clear()
	if is_instance_valid(player):
		player.free()
	player = Fixtures.create(index, $Actors)
	player.name = "Player"
	player.position = Vector2(360, 360)
	player.health_changed.connect(update_health)
	update_health(player.health, player.maximum_health)
	status.text = "WASD/arrows move · Space jump · J attack · Start to fight"

func update_health(current: int, maximum: int) -> void:
	health_bar.max_value = maximum
	health_bar.value = current

func start_run() -> void:
	select_character(selected)
	wave = 0
	spawned = 0
	running = true
	maintain_waves()

func maintain_waves() -> void:
	for index in range(enemies.size() - 1, -1, -1):
		if enemies[index].state == "knockout":
			enemies[index].queue_free()
			enemies.remove_at(index)
	if spawned == WAVES[wave] and enemies.is_empty():
		wave += 1
		spawned = 0
		if wave == WAVES.size():
			running = false
			completed = true
			status.text = "All waves complete! Select a fixture or restart."
			return
	while enemies.size() < ACTIVE_CAP and spawned < WAVES[wave]:
		var enemy = Fixtures.create(1 - selected, $Actors)
		enemy.team = 1
		enemy.position = Vector2(680 + 70 * enemies.size(), 350 + 65 * enemies.size())
		enemies.append(enemy)
		spawned += 1
	status.text = "Wave %d/%d · Enemies %d · J attack / Space jump" % [wave + 1, WAVES.size(), WAVES[wave] - spawned + enemies.size()]

func _physics_process(delta: float) -> void:
	if not is_instance_valid(player):
		return
	if Input.is_action_just_pressed("jump"):
		player.jump()
	if Input.is_action_pressed("light_attack"):
		player.begin_attack()
	player.step(delta, Input.get_vector("move_left", "move_right", "move_up", "move_down"), enemies)
	if not running:
		return
	if player.state == "knockout":
		running = false
		status.text = "Knocked out — restart to try again."
		return
	for enemy in enemies:
		enemy.step(delta, Brain.intent(enemy, player), [player])
	maintain_waves()
