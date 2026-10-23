extends RefCounted
# Async implementations return {ok:true,value:...} or {ok:false,error:code}.
# Asset references are {characterId, characterVersion, assetId}, never paths/URLs.

func list_characters() -> Dictionary:
	return {"ok": false, "error": "not_implemented"}

func get_manifest(_character_id: String, _version: int) -> Dictionary:
	return {"ok": false, "error": "not_implemented"}

func get_asset_bytes(_asset_ref: Dictionary) -> Dictionary:
	return {"ok": false, "error": "not_implemented"}

func refresh() -> Dictionary:
	return {"ok": false, "error": "refresh_not_supported"}
