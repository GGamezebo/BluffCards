class_name ResourceUtils
extends RefCounted

const USAGE_PROPERY = PROPERTY_USAGE_STORAGE | PROPERTY_USAGE_SCRIPT_VARIABLE
const PROPERTY_BLACKLIST = [
	"script",
	"resource_path",
	"resource_name",
	"resource_local_to_scene",
]

## Pure-data JSON I/O via FileAccess. Prefer over ResourceSaver/ResourceLoader
## for anything under user:// (no Resource/script instantiation from disk).
##
## Writes are atomic (tmp → rename) and keep a single `.bak` of the previous file.
## Loads distinguish MISSING vs CORRUPT so callers never wipe a damaged save.

enum JsonLoadStatus {
	OK,
	MISSING,
	CORRUPT,
}

static func json_exists(path: String) -> bool:
	return FileAccess.file_exists(path)

static func bak_path(path: String) -> String:
	return path + ".bak"

static func tmp_path(path: String) -> String:
	return path + ".tmp"

## Atomic save: write `path.tmp`, optionally move existing `path` → `path.bak`, then
## rename tmp into place. `make_backup=false` when repairing from an existing bak.
static func save_json(path: String, data: Variant, make_backup: bool = true) -> Error:
	var abs_path: String = ProjectSettings.globalize_path(path)
	var abs_tmp: String = ProjectSettings.globalize_path(tmp_path(path))
	var abs_bak: String = ProjectSettings.globalize_path(bak_path(path))

	var file: FileAccess = FileAccess.open(tmp_path(path), FileAccess.WRITE)
	if file == null:
		var open_err: Error = FileAccess.get_open_error()
		push_error("ResourceUtils.save_json: cannot write %s (error %d)" % [tmp_path(path), open_err])
		return open_err
	file.store_string(JSON.stringify(data, "\t"))
	file.close()

	if FileAccess.file_exists(path):
		if make_backup:
			var bak_err: Error = _replace_file(abs_bak, abs_path)
			if bak_err != OK:
				push_error("ResourceUtils.save_json: backup failed for %s (error %d)" % [path, bak_err])
				DirAccess.remove_absolute(abs_tmp)
				return bak_err
		else:
			var rm_err: Error = DirAccess.remove_absolute(abs_path)
			if rm_err != OK:
				push_error("ResourceUtils.save_json: cannot remove %s before replace (error %d)" % [path, rm_err])
				DirAccess.remove_absolute(abs_tmp)
				return rm_err

	var rename_err: Error = DirAccess.rename_absolute(abs_tmp, abs_path)
	if rename_err != OK:
		push_error("ResourceUtils.save_json: cannot install %s (error %d)" % [path, rename_err])
		DirAccess.remove_absolute(abs_tmp)
		return rename_err
	return OK

## {"status": JsonLoadStatus, "data": Dictionary}
static func load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"status": JsonLoadStatus.MISSING, "data": {}}
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("ResourceUtils.load_json: cannot read %s (error %d)" % [path, FileAccess.get_open_error()])
		return {"status": JsonLoadStatus.CORRUPT, "data": {}}
	var text: String = file.get_as_text()
	file.close()
	if text.strip_edges().is_empty():
		push_error("ResourceUtils.load_json: empty file %s" % path)
		return {"status": JsonLoadStatus.CORRUPT, "data": {}}
	var parsed: Variant = JSON.parse_string(text)
	if parsed == null or not (parsed is Dictionary):
		push_error("ResourceUtils.load_json: invalid JSON in %s" % path)
		return {"status": JsonLoadStatus.CORRUPT, "data": {}}
	return {"status": JsonLoadStatus.OK, "data": parsed}

## Convenience: data on OK, else {}. Prefer `load_json` when MISSING vs CORRUPT matters.
static func load_json_dict(path: String) -> Dictionary:
	var result: Dictionary = load_json(path)
	return result["data"] if int(result["status"]) == JsonLoadStatus.OK else {}

## Move/copy `abs_from` onto `abs_to`, replacing any existing destination.
static func _replace_file(abs_to: String, abs_from: String) -> Error:
	if FileAccess.file_exists(abs_to):
		var rm_err: Error = DirAccess.remove_absolute(abs_to)
		if rm_err != OK:
			push_error("ResourceUtils: cannot remove %s (error %d)" % [abs_to, rm_err])
			return rm_err
	var rename_err: Error = DirAccess.rename_absolute(abs_from, abs_to)
	if rename_err == OK:
		return OK
	# Cross-device / some platforms: fall back to copy + remove.
	var from_file: FileAccess = FileAccess.open(abs_from, FileAccess.READ)
	if from_file == null:
		return FileAccess.get_open_error()
	var bytes: PackedByteArray = from_file.get_buffer(from_file.get_length())
	from_file.close()
	var to_file: FileAccess = FileAccess.open(abs_to, FileAccess.WRITE)
	if to_file == null:
		return FileAccess.get_open_error()
	to_file.store_buffer(bytes)
	to_file.close()
	return DirAccess.remove_absolute(abs_from)

## Serialize a resource's stored properties into a plain (JSON-safe) Dictionary.
## Use with save_json instead of ResourceSaver for user:// data.
static func resource_to_dict(resource: Resource) -> Dictionary:
	var data: Dictionary = {}
	if not resource:
		return data
	for property in resource.get_property_list():
		var prop_name: String = property["name"]
		var prop_usage: int = property["usage"]
		if not (prop_usage & USAGE_PROPERY) or prop_name in PROPERTY_BLACKLIST:
			continue
		var value = resource.get(prop_name)
		if value is Array or value is Dictionary:
			data[prop_name] = value.duplicate(true)
		else:
			data[prop_name] = value
	return data

## Apply a plain Dictionary (e.g. loaded from JSON) onto a resource's properties.
static func apply_dict(resource: Resource, data: Dictionary) -> void:
	if not resource or data.is_empty():
		return
	for prop_name in data:
		if prop_name in PROPERTY_BLACKLIST or not prop_name in resource:
			continue
		var value = data[prop_name]
		if value is Array or value is Dictionary:
			resource.set(prop_name, value.duplicate(true))
		else:
			resource.set(prop_name, value)
	resource.emit_changed()

static func update_resource(target: Resource, source: Resource) -> void:
	if not target or not source:
		push_error("Resource update failed: Target or Source is null.")
		return
	
	# Different scripts mean properties cannot be copied safely — abort early.
	if target.get_script() != source.get_script():
		push_error("Resource update failed: Target and Source scripts mismatch. Cannot override.")
		return

	# Iterate over source properties
	for property in source.get_property_list():
		var prop_name: String = property["name"]
		var prop_usage: int = property["usage"]

		# 1. Check STORAGE flag
		# 2. Skip blacklisted properties
		if (prop_usage & USAGE_PROPERY) and not (prop_name in PROPERTY_BLACKLIST):
			
			# Safety: skip if target does not have this property
			if not prop_name in target:
				continue
				
			var value = source.get(prop_name)
			
			if value == null:
				target.set(prop_name, null)
				continue

			# Handle value types
			if value is Array or value is Dictionary:
				target.set(prop_name, value.duplicate(true))
			elif value is Resource:
				# Option A: deep duplicate (independent sub-resource copy)
				target.set(prop_name, value.duplicate(true))
				
				# Option B: for recursive nested resource override, use:
				# var target_sub_res = target.get(prop_name)
				# if target_sub_res and target_sub_res.get_script() == value.get_script():
				#     update_resource(target_sub_res, value)
				# else:
				#     target.set(prop_name, value.duplicate(true))
			else:
				# Atomic types (int, float, Vector, etc.)
				target.set(prop_name, value)
	
	# Notify listeners of changes
	target.emit_changed()
	
static func reset_resource_to_default(resource: Resource, default_resource: Resource) -> void:
	update_resource(resource, default_resource)
	
static func save_resource_to_disk(resource: Resource, path: String) -> void:
	var error = ResourceSaver.save(resource, path)
	if error == OK:
		print("resource %s is saved " % path)
	else:
		print("Error %s while saving resource %s" % [str(error), path])

static func hard_reset_resource(path: String, resource: Resource, default_resource: Resource) -> void:
	reset_resource_to_default(resource, default_resource)
	save_resource_to_disk(resource, path)
