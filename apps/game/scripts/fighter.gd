extends CharacterBody2D

signal health_changed(current: int, maximum: int)
signal knocked_out

@export var move_speed := 180.0
@export var maximum_health := 100
@export var team := 0
@export var gravity := 900.0
@export var jump_speed := 360.0
@export var attack_damage := 10
@export var attack_range := 100.0
@export var attack_startup := 0.1
@export var attack_active := 0.15
@export var attack_recovery := 0.2

var health: int
var elevation := 0.0
var vertical_speed := 0.0
var facing := 1
var state := "idle"
var attack_elapsed := 0.0
var attack_targets: Dictionary = {}
var _ko_emitted := false

func _ready() -> void:
	health = maximum_health

func set_move_intent(direction: Vector2, delta: float) -> void:
	if state == "knockout":
		return
	var normalized := direction.normalized()
	velocity = normalized * move_speed
	if direction.x != 0:
		facing = 1 if direction.x > 0 else -1
	if state != "attack" and state != "hurt":
		state = "walk" if direction.length_squared() > 0 else "idle"
	move_and_slide()
	_step_jump(delta)

func jump() -> void:
	if elevation == 0.0 and state != "knockout":
		vertical_speed = jump_speed

func _step_jump(delta: float) -> void:
	if elevation > 0.0 or vertical_speed > 0.0:
		vertical_speed -= gravity * delta
		elevation = maxf(0.0, elevation + vertical_speed * delta)
		if elevation == 0.0:
			vertical_speed = 0.0

func begin_attack() -> void:
	if state in ["attack", "hurt", "knockout"]:
		return
	state = "attack"
	attack_elapsed = 0.0
	attack_targets.clear()

func tick_combat(delta: float, opponents: Array[Node]) -> void:
	if state != "attack":
		return
	attack_elapsed += delta
	var active_start := attack_startup
	var active_end := active_start + attack_active
	if attack_elapsed >= active_start and attack_elapsed < active_end:
		for opponent in opponents:
			if not is_instance_valid(opponent) or opponent == self or opponent.team == team or attack_targets.has(opponent.get_instance_id()):
				continue
			if opponent.elevation > 40.0:
				continue
			var offset: Vector2 = opponent.global_position - global_position
			if offset.x * facing >= 0.0 and absf(offset.x) <= attack_range and absf(offset.y) <= 80.0:
				attack_targets[opponent.get_instance_id()] = true
				opponent.take_damage(attack_damage, facing)
	if attack_elapsed >= active_end + attack_recovery:
		state = "idle"

func take_damage(amount: int, knockback_direction: int = 0) -> void:
	if state == "knockout" or amount <= 0:
		return
	health = maxi(0, health - amount)
	health_changed.emit(health, maximum_health)
	if health == 0:
		state = "knockout"
		if not _ko_emitted:
			_ko_emitted = true
			knocked_out.emit()
	else:
		state = "hurt"
		velocity.x = knockback_direction * 180.0

func load_character_data(data: Dictionary) -> bool:
	if int(data.get("schemaVersion", 0)) != 1 or not data.has("stats") or not data.has("attacks"):
		return false
	move_speed = float(data.stats.moveSpeed)
	maximum_health = int(data.stats.health)
	health = maximum_health
	if data.attacks.is_empty():
		return false
	var attack: Dictionary = data.attacks[0]
	attack_damage = int(attack.damage)
	attack_range = float(data.hitboxes[0].rect.width) + 20.0
	attack_startup = float(attack.startupSeconds)
	attack_active = float(attack.activeSeconds)
	attack_recovery = float(attack.recoverySeconds)
	return true
