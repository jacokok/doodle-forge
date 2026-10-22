extends SceneTree

func _initialize() -> void:
	var scene := load("res://scenes/main.tscn") as PackedScene
	if scene == null:
		fail("main_scene_missing")
		return
	var instance := scene.instantiate()
	root.add_child(instance)
	if not instance is Node2D or not instance.get_node_or_null("Actors/Player") is CharacterBody2D:
		fail("main_scene_structure")
		return
	if ProjectSettings.get_setting("rendering/renderer/rendering_method") != "gl_compatibility":
		fail("renderer_mismatch")
		return
	print('{"suite":"foundation","status":"passed","assertions":3}')
	quit(0)

func fail(reason: String) -> void:
	print(JSON.stringify({"suite": "foundation", "status": "failed", "reason": reason}))
	quit(1)
