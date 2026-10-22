extends RefCounted

static func intent(enemy: Node, target: Node) -> Vector2:
	if target.state == "knockout" or enemy.state == "knockout":
		return Vector2.ZERO
	var offset: Vector2 = target.position - enemy.position
	if offset.x != 0 and enemy.state not in ["attack", "hurt"]:
		enemy.facing = 1 if offset.x > 0 else -1
	if absf(offset.x) <= 65 and absf(offset.y) <= 18:
		enemy.begin_attack()
		return Vector2.ZERO
	return Vector2(offset.x if absf(offset.x) > 55 else 0.0, offset.y if absf(offset.y) > 8 else 0.0).limit_length()
