extends RefCounted
# Fixed development fixtures, not an API/release/bundle repository.
const PATHS := [
	"res://../../packages/contracts/fixtures/sprout/v1/character.json",
	"res://../../packages/contracts/fixtures/comet/v1/character.json",
]
const FIGHTER = preload("res://scenes/fighter.tscn")

static func create(index: int, parent: Node):
	var path: String = PATHS[index]
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
	var fighter = FIGHTER.instantiate()
	parent.add_child(fighter)
	if not fighter.load_character_data(data):
		fighter.queue_free()
		return null
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for animation in data.animations:
		var entry: Dictionary = data.animations[animation]
		var image := Image.load_from_file(path.get_base_dir().path_join(data.assets[entry.assetId].path))
		if image == null:
			fighter.queue_free()
			return null
		var texture := ImageTexture.create_from_image(image)
		frames.add_animation(animation)
		frames.set_animation_speed(animation, float(entry.fps))
		frames.set_animation_loop(animation, bool(entry.loop))
		for frame in int(entry.frameCount):
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2((frame % int(entry.columns)) * int(entry.frameWidth), (frame / int(entry.columns)) * int(entry.frameHeight), entry.frameWidth, entry.frameHeight)
			frames.add_frame(animation, atlas)
	fighter.sprite.sprite_frames = frames
	var anchor: Dictionary = data.animations.idle.footAnchor
	fighter.sprite.position = -Vector2(anchor.x, anchor.y)
	fighter.sprite.play("idle")
	fighter.set_meta("character_name", data.name)
	return fighter
