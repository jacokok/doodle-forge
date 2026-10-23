extends RefCounted
const Resources = preload("res://scripts/content/character_resources.gd")
const FIGHTER = preload("res://scenes/fighter.tscn")
var _repository: RefCounted
var _busy := false

func _init(repository: RefCounted) -> void:
	_repository = repository

func create(character_id: String, version: int, parent: Node) -> Dictionary:
	if _busy:
		return Resources.error("factory_busy")
	_busy = true
	var result := await _create(character_id, version, parent)
	_busy = false
	return result

func _create(character_id: String, version: int, parent: Node) -> Dictionary:
	if not is_instance_valid(parent) or not parent.is_inside_tree():
		return Resources.error("invalid_parent")
	var catalog: Dictionary = await _repository.list_characters()
	if not catalog.ok:
		return catalog
	var manifest: Dictionary = await _repository.get_manifest(character_id, version)
	if not manifest.ok:
		return manifest
	# Own the data for this load; no externally mutable combat definitions.
	var data: Dictionary = manifest.value.duplicate(true)
	var resources := await Resources.build(_repository, data)
	if not resources.ok:
		return resources
	if not is_instance_valid(parent) or not parent.is_inside_tree():
		return Resources.error("invalid_parent")
	var fighter = FIGHTER.instantiate()
	if not fighter.load_character_data(data):
		fighter.free()
		return Resources.error("fighter_definition")
	parent.add_child(fighter)
	fighter.sprite.sprite_frames = resources.value.frames
	var anchor: Dictionary = data.animations.idle.footAnchor
	fighter.sprite.position = -Vector2(anchor.x, anchor.y)
	fighter.sprite.play("idle")
	fighter.set_meta("character_name", data.name)
	fighter.set_meta("character_id", data.characterId)
	fighter.set_meta("character_version", int(data.characterVersion))
	fighter.set_meta("release_id", catalog.value.releaseId)
	return {"ok": true, "value": fighter}
