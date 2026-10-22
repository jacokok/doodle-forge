extends CharacterBody2D

signal health_changed(current: int, maximum: int)
signal knocked_out

var move_speed := 180.0
var maximum_health := 100
var team := 0
var health := 100
var elevation := 0.0
var vertical_speed := 0.0
var facing := 1
var state := "idle"
var attack_elapsed := 0.0
var cooldown := 0.0
var hurt_remaining := 0.0
var attack_targets: Dictionary = {}
var attack: Dictionary
var hitboxes: Array = []
var hurtboxes: Array = []
var arena_bounds := Rect2(60, 250, 840, 240)
var _ko_emitted := false
@onready var pivot: Node2D = $VisualPivot
@onready var sprite: AnimatedSprite2D = $VisualPivot/AnimatedSprite2D
@onready var shadow: Polygon2D = $Shadow

func load_character_data(data: Dictionary) -> bool:
	# Trusted, TS-validated Phase 2 fixtures only; not a public package validator.
	if int(data.get("schemaVersion", 0)) != 1 or data.get("attacks", []).is_empty():
		return false
	move_speed = float(data.stats.moveSpeed)
	maximum_health = int(data.stats.health)
	health = maximum_health
	attack = data.attacks[0]
	hitboxes = data.hitboxes.filter(func(box): return box.id in attack.hitboxIds)
	hurtboxes = data.hurtboxes
	return true

func jump() -> void:
	if elevation == 0.0 and state in ["idle", "walk"]:
		vertical_speed = 360.0
		state = "jump"

func begin_attack() -> void:
	if state not in ["idle", "walk"] or elevation > 0.0 or cooldown > 0.0:
		return
	state = "attack"
	attack_elapsed = 0.0
	cooldown = float(attack.cooldownSeconds)
	attack_targets.clear()

func step(delta: float, direction: Vector2, opponents: Array) -> void:
	cooldown = maxf(0.0, cooldown - delta)
	if state == "knockout":
		velocity = Vector2.ZERO
	elif state == "hurt":
		hurt_remaining = maxf(0.0, hurt_remaining - delta)
		if hurt_remaining == 0.0:
			state = "idle"
	else:
		velocity = Vector2.ZERO if state == "attack" else direction.limit_length() * move_speed
		if direction.x != 0.0 and state != "attack":
			facing = 1 if direction.x > 0 else -1
		if state not in ["attack", "jump"]:
			state = "walk" if direction != Vector2.ZERO else "idle"
	move_and_slide()
	position = position.clamp(arena_bounds.position, arena_bounds.end)
	_step_jump(delta)
	tick_combat(delta, opponents)
	update_visuals()

func _step_jump(delta: float) -> void:
	if elevation > 0.0 or vertical_speed > 0.0:
		vertical_speed -= 900.0 * delta
		elevation = maxf(0.0, elevation + vertical_speed * delta)
		if elevation == 0.0:
			vertical_speed = 0.0
			if state == "jump":
				state = "idle"

func box_rect(box: Dictionary) -> Rect2:
	var rect: Dictionary = box.rect
	return Rect2(global_position + Vector2(float(rect.x) if facing > 0 else -float(rect.x) - float(rect.width), float(rect.y)), Vector2(rect.width, rect.height))

func can_hit(opponent: Node) -> bool:
	if opponent == self or opponent.team == team or opponent.state == "knockout":
		return false
	for hit in hitboxes:
		if opponent.elevation < float(hit.minElevation) or opponent.elevation > float(hit.maxElevation):
			continue
		for hurt in opponent.hurtboxes:
			if box_rect(hit).intersects(opponent.box_rect(hurt)):
				return true
	return false

func tick_combat(delta: float, opponents: Array) -> void:
	if state != "attack":
		return
	var previous := attack_elapsed
	attack_elapsed += delta
	var start := float(attack.startupSeconds)
	var end := start + float(attack.activeSeconds)
	# Interval overlap also handles a physics step spanning the entire window.
	if attack_elapsed >= start and previous < end:
		for opponent in opponents:
			if is_instance_valid(opponent) and not attack_targets.has(opponent.get_instance_id()) and can_hit(opponent):
				attack_targets[opponent.get_instance_id()] = true
				opponent.take_damage(int(attack.damage), facing, attack.knockback)
	if attack_elapsed >= end + float(attack.recoverySeconds):
		state = "idle"

func take_damage(amount: int, direction := 0, knockback: Dictionary = {}) -> void:
	if state == "knockout" or amount <= 0:
		return
	health = maxi(0, health - amount)
	health_changed.emit(health, maximum_health)
	if health == 0:
		state = "knockout"
		velocity = Vector2.ZERO
		if not _ko_emitted:
			_ko_emitted = true
			knocked_out.emit()
	else:
		state = "hurt"
		hurt_remaining = maxf(0.2, float(knockback.get("durationSeconds", 0.2)))
		velocity = Vector2(direction * float(knockback.get("xSpeed", 0)), float(knockback.get("depthSpeed", 0)))

func update_visuals() -> void:
	pivot.position.y = -elevation
	pivot.scale.x = facing
	shadow.scale = Vector2.ONE * maxf(0.45, 1.0 - elevation / 240.0)
	var animation := str(attack.animation) if state == "attack" else state
	if not sprite.sprite_frames.has_animation(animation):
		animation = "idle"
	if sprite.animation != animation:
		sprite.play(animation)
