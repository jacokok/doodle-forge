extends Node2D

const Fixtures = preload("res://scripts/fixtures.gd")
const Brain = preload("res://scripts/enemy_brain.gd")
const ApiRepository = preload("res://scripts/content/api_character_repository.gd")
const Factory = preload("res://scripts/content/character_factory.gd")
const WAVES := [2, 3]
const ACTIVE_CAP := 2
var player
var enemies: Array[Node] = []
var selected := 0
var wave := 0
var spawned := 0
var running := false
var completed := false
# Configure before entering the tree, or use --content-api[=loopback-origin].
var api_mode := false
var api_url := "http://127.0.0.1:5173"
var content_state := "fixtures"
var content_error := ""
var release_id := ""
var _entries: Array = []
var _repository: RefCounted
var _factory: RefCounted
var _loading := false
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
	selection.item_selected.connect(select_character)
	$HUD/Start.pressed.connect(start_run)
	for argument in OS.get_cmdline_user_args():
		if argument == "--fixture=comet":
			selected = 1
		if argument == "--content-api" or argument.begins_with("--content-api="):
			api_mode = true
			if argument.begins_with("--content-api="):
				api_url = argument.trim_prefix("--content-api=")
	if api_mode:
		selected = 0
		_repository = ApiRepository.new(self, api_url)
		_factory = Factory.new(_repository)
		_discover_api()
		return
	selection.add_item("Sprout")
	selection.add_item("Comet")
	selection.select(selected)
	select_character(selected)

func select_character(index: int) -> void:
	if api_mode:
		await _select_api(index, false)
		return
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
	if api_mode:
		if _entries.is_empty():
			await _discover_api()
		else:
			await _select_api(selected, true)
		return
	select_character(selected)
	wave = 0
	spawned = 0
	running = true
	maintain_waves()

func maintain_waves() -> void:
	if api_mode and (_loading or not running):
		return
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
			status.text = "All waves complete! Select a character or restart."
			return
	if api_mode:
		await _fill_api_wave()
		return
	while enemies.size() < ACTIVE_CAP and spawned < WAVES[wave]:
		var enemy = Fixtures.create(1 - selected, $Actors)
		enemy.team = 1
		enemy.position = Vector2(680 + 70 * enemies.size(), 350 + 65 * enemies.size())
		enemies.append(enemy)
		spawned += 1
	status.text = "Wave %d/%d · Enemies %d · J attack / Space jump" % [wave + 1, WAVES.size(), WAVES[wave] - spawned + enemies.size()]

func _physics_process(delta: float) -> void:
	if _loading or not is_instance_valid(player):
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

func _set_loading(message: String) -> void:
	_loading = true
	content_state = "loading"
	content_error = ""
	selection.disabled = true
	$HUD/Start.disabled = true
	status.text = message

func _finish_loading() -> void:
	_loading = false
	selection.disabled = _entries.is_empty()
	$HUD/Start.disabled = false

func _clear_match() -> void:
	running = false
	completed = false
	for enemy in enemies:
		enemy.free()
	enemies.clear()
	if is_instance_valid(player):
		player.free()
	player = null
	update_health(0, 1)

func _api_failure(code: String) -> void:
	_clear_match()
	content_state = "error"
	content_error = code
	_finish_loading()
	status.text = "Content error: %s · Start to retry (same release; no fixture fallback)" % code

func _discover_api() -> void:
	if _loading:
		return
	_set_loading("Loading published catalog…")
	content_state = "discovering"
	var result: Dictionary = await _repository.list_characters()
	if not result.ok:
		_api_failure(result.error)
		return
	# Own this selection snapshot; never replace the repository or catalog in a match.
	release_id = result.value.releaseId
	_entries = result.value.characters.duplicate(true)
	selection.clear()
	for entry in _entries:
		selection.add_item("%s · v%d" % [entry.characterId.left(8), int(entry.characterVersion)])
	if _entries.is_empty():
		_api_failure("empty_catalog")
		return
	_finish_loading()
	await _select_api(0, false)

func _create_api(index: int) -> Dictionary:
	var entry: Dictionary = _entries[index]
	return await _factory.create(entry.characterId, int(entry.characterVersion), $Actors)

func _select_api(index: int, start_match: bool) -> void:
	# Reject overlapping UI AND programmatic actions. No queued/superseding loads:
	# only this operation can install fighters or change match state across awaits.
	if _loading:
		return
	if index < 0 or index >= _entries.size():
		return
	selection.release_focus()
	$HUD/Start.release_focus()
	_set_loading("Loading published character…")
	_clear_match()
	selected = index
	selection.select(index)
	var result := await _create_api(index)
	if not result.ok:
		_api_failure(result.error)
		return
	player = result.value
	selection.set_item_text(index, "%s · v%d" % [player.get_meta("character_name"), int(player.get_meta("character_version"))])
	player.name = "Player"
	player.position = Vector2(360, 360)
	player.health_changed.connect(update_health)
	update_health(player.health, player.maximum_health)
	content_state = "ready"
	status.text = "%s · WASD/arrows move · Space jump · J attack · Start to fight" % player.get_meta("character_name")
	if start_match:
		wave = 0
		spawned = 0
		running = true
		await _spawn_api_enemies()
	_finish_loading()

func _spawn_api_enemies() -> void:
	while enemies.size() < ACTIVE_CAP and spawned < WAVES[wave]:
		# Any catalog size, including a single character; no fixture IDs/names.
		var result := await _create_api((selected + 1) % _entries.size())
		if not result.ok:
			_api_failure(result.error)
			return
		var enemy = result.value
		enemy.team = 1
		enemy.position = Vector2(680 + 70 * enemies.size(), 350 + 65 * enemies.size())
		enemies.append(enemy)
		spawned += 1
	content_state = "ready"
	status.text = "Wave %d/%d · Enemies %d · J attack / Space jump" % [wave + 1, WAVES.size(), WAVES[wave] - spawned + enemies.size()]

func _fill_api_wave() -> void:
	if enemies.size() >= ACTIVE_CAP or spawned >= WAVES[wave]:
		return
	_set_loading("Loading published enemies…")
	await _spawn_api_enemies()
	_finish_loading()
