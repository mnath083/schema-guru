from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from schemaguard.reporter import CompatibilityIssue, issue
from schemaguard.rules import logical_type, primitive_compatible, type_label


COMPLEX_TYPES = {"record", "enum", "fixed", "array", "map"}


@dataclass
class NameInfo:
    fullname: str
    namespace: str | None
    aliases: set[str]


class SchemaRegistry:
    def __init__(self, schema: Any):
        self.schema = schema
        self.named_types: dict[str, dict[str, Any]] = {}
        self.alias_to_fullname: dict[str, str] = {}
        self.node_name_info: dict[int, NameInfo] = {}
        self._collect(schema, default_namespace=None)

    def _collect(self, node: Any, default_namespace: str | None) -> None:
        if isinstance(node, list):
            for branch in node:
                self._collect(branch, default_namespace)
            return

        if isinstance(node, str) or not isinstance(node, dict):
            return

        node_type = node.get("type")
        if isinstance(node_type, list):
            self._collect(node_type, default_namespace)
            return
        if isinstance(node_type, dict):
            self._collect(node_type, default_namespace)
            return

        if node_type in {"record", "enum", "fixed"}:
            fullname = self._resolve_name(
                name=node.get("name"),
                explicit_namespace=node.get("namespace"),
                default_namespace=default_namespace,
            )
            if not fullname:
                return
            namespace = self._namespace_for_fullname(fullname)
            aliases = self._resolve_aliases(
                aliases=node.get("aliases", []),
                namespace=namespace,
            )
            info = NameInfo(fullname=fullname, namespace=namespace, aliases=aliases)
            self.node_name_info[id(node)] = info
            self.named_types[fullname] = node
            for alias in aliases:
                self.alias_to_fullname[alias] = fullname

            if node_type == "record":
                for field in node.get("fields", []):
                    self._collect(field.get("type"), namespace)
            return

        if node_type == "array":
            self._collect(node.get("items"), default_namespace)
            return

        if node_type == "map":
            self._collect(node.get("values"), default_namespace)
            return

        if isinstance(node_type, str):
            resolved, _ = self.resolve_reference(node_type, default_namespace)
            if resolved is not None:
                self._collect(resolved, default_namespace)

    @staticmethod
    def _resolve_name(
        *,
        name: Any,
        explicit_namespace: Any,
        default_namespace: str | None,
    ) -> str | None:
        if not isinstance(name, str) or not name:
            return None
        if "." in name:
            return name
        namespace = explicit_namespace if isinstance(explicit_namespace, str) else default_namespace
        return f"{namespace}.{name}" if namespace else name

    @staticmethod
    def _namespace_for_fullname(fullname: str) -> str | None:
        if "." not in fullname:
            return None
        return fullname.rsplit(".", 1)[0]

    def _resolve_aliases(self, aliases: Any, namespace: str | None) -> set[str]:
        resolved: set[str] = set()
        if not isinstance(aliases, list):
            return resolved
        for alias in aliases:
            if not isinstance(alias, str) or not alias:
                continue
            if "." in alias:
                resolved.add(alias)
            elif namespace:
                resolved.add(f"{namespace}.{alias}")
            else:
                resolved.add(alias)
        return resolved

    def resolve_reference(self, name: str, default_namespace: str | None) -> tuple[Any | None, str | None]:
        candidates = [name] if "." in name else ([f"{default_namespace}.{name}"] if default_namespace else []) + [name]
        for candidate in candidates:
            if candidate in self.named_types:
                return self.named_types[candidate], candidate
            alias_target = self.alias_to_fullname.get(candidate)
            if alias_target and alias_target in self.named_types:
                return self.named_types[alias_target], alias_target
        return None, None

    def resolve_node(self, node: Any, default_namespace: str | None) -> tuple[Any | None, str | None]:
        current = node
        ns = default_namespace
        visited: set[int] = set()
        while True:
            if isinstance(current, str):
                if current in {"null", "boolean", "int", "long", "float", "double", "bytes", "string"}:
                    return current, ns
                ref, fullname = self.resolve_reference(current, ns)
                if ref is None or id(ref) in visited:
                    return None, None
                visited.add(id(ref))
                current = ref
                ns = self.namespace_for_node(ref)
                continue

            if isinstance(current, dict):
                node_type = current.get("type")
                if isinstance(node_type, str) and node_type not in COMPLEX_TYPES and node_type not in {
                    "null",
                    "boolean",
                    "int",
                    "long",
                    "float",
                    "double",
                    "bytes",
                    "string",
                }:
                    ref, fullname = self.resolve_reference(node_type, ns)
                    if ref is None or id(ref) in visited:
                        return None, None
                    visited.add(id(ref))
                    current = ref
                    ns = self._namespace_for_fullname(fullname) if fullname else ns
                    continue
                if node_type in {"record", "enum", "fixed"}:
                    ns = self.namespace_for_node(current)
                return current, ns

            return current, ns

    def namespace_for_node(self, node: Any) -> str | None:
        info = self.node_name_info.get(id(node))
        return info.namespace if info else None

    def short_name_for_node(self, node: Any) -> str | None:
        info = self.node_name_info.get(id(node))
        if not info:
            return None
        if "." in info.fullname:
            return info.fullname.rsplit(".", 1)[1]
        return info.fullname

class CompatibilityEngine:
    def __init__(self, writer_schema: Any, reader_schema: Any, direction: str):
        self.writer_registry = SchemaRegistry(writer_schema)
        self.reader_registry = SchemaRegistry(reader_schema)
        self.direction = direction
        self.errors: list[CompatibilityIssue] = []

    def run(self) -> list[CompatibilityIssue]:
        root_name = self.writer_registry.short_name_for_node(self.writer_registry.schema)
        root_path = root_name or "RootSchema"
        self._compare(
            writer_node=self.writer_registry.schema,
            reader_node=self.reader_registry.schema,
            path=root_path,
            writer_namespace=None,
            reader_namespace=None,
        )
        return self.errors

    def _add_error(
        self,
        *,
        path: str,
        issue_type: str,
        writer_type: str,
        reader_type: str,
        description: str,
    ) -> None:
        self.errors.append(
            issue(
                path=path,
                issue_type=issue_type,
                writer_type=writer_type,
                reader_type=reader_type,
                description=description,
            )
        )

    def _compare(
        self,
        *,
        writer_node: Any,
        reader_node: Any,
        path: str,
        writer_namespace: str | None,
        reader_namespace: str | None,
    ) -> bool:
        writer_union = self._as_union(writer_node)
        reader_union = self._as_union(reader_node)
        if writer_union is not None or reader_union is not None:
            return self._compare_union(
                writer_union=writer_union,
                reader_union=reader_union,
                writer_node=writer_node,
                reader_node=reader_node,
                path=path,
                writer_namespace=writer_namespace,
                reader_namespace=reader_namespace,
            )

        writer_resolved, writer_namespace = self.writer_registry.resolve_node(writer_node, writer_namespace)
        reader_resolved, reader_namespace = self.reader_registry.resolve_node(reader_node, reader_namespace)

        if writer_resolved is None:
            self._add_error(
                path=path,
                issue_type="UNKNOWN_WRITER_TYPE",
                writer_type=type_label(writer_node),
                reader_type=type_label(reader_node),
                description="Writer schema references an unknown named type.",
            )
            return False
        if reader_resolved is None:
            self._add_error(
                path=path,
                issue_type="UNKNOWN_READER_TYPE",
                writer_type=type_label(writer_node),
                reader_type=type_label(reader_node),
                description="Reader schema references an unknown named type.",
            )
            return False

        writer_logical = logical_type(writer_resolved)
        reader_logical = logical_type(reader_resolved)
        if writer_logical != reader_logical:
            self._add_error(
                path=path,
                issue_type="LOGICAL_TYPE_CHANGED",
                writer_type=writer_logical or "none",
                reader_type=reader_logical or "none",
                description="Logical type changes are not compatible.",
            )
            return False

        writer_kind = self._kind(writer_resolved)
        reader_kind = self._kind(reader_resolved)

        if writer_kind == "primitive" and reader_kind == "primitive":
            writer_primitive = self._primitive_name(writer_resolved)
            reader_primitive = self._primitive_name(reader_resolved)
            if primitive_compatible(writer_primitive, reader_primitive):
                return True
            self._add_error(
                path=path,
                issue_type="TYPE_MISMATCH",
                writer_type=writer_primitive,
                reader_type=reader_primitive,
                description="Primitive type promotion is not allowed by Avro for this direction.",
            )
            return False

        if writer_kind != reader_kind:
            self._add_error(
                path=path,
                issue_type="TYPE_MISMATCH",
                writer_type=type_label(writer_resolved),
                reader_type=type_label(reader_resolved),
                description="Writer and reader types are incompatible.",
            )
            return False

        if writer_kind in {"record", "enum", "fixed"}:
            if not isinstance(writer_resolved, dict) or not isinstance(reader_resolved, dict):
                self._add_error(
                    path=path,
                    issue_type="TYPE_MISMATCH",
                    writer_type=type_label(writer_resolved),
                    reader_type=type_label(reader_resolved),
                    description="Named type resolution failed.",
                )
                return False
            if not self._named_types_compatible(writer_resolved, reader_resolved):
                self._add_error(
                    path=path,
                    issue_type="TYPE_MISMATCH",
                    writer_type=type_label(writer_resolved),
                    reader_type=type_label(reader_resolved),
                    description="Named type full names (including namespace) do not match.",
                )
                return False

        if writer_kind == "record":
            return self._compare_record(
                writer_record=writer_resolved,
                reader_record=reader_resolved,
                path=path,
            )
        if writer_kind == "array":
            return self._compare(
                writer_node=writer_resolved.get("items"),
                reader_node=reader_resolved.get("items"),
                path=f"{path}.items",
                writer_namespace=writer_namespace,
                reader_namespace=reader_namespace,
            )
        if writer_kind == "map":
            return self._compare(
                writer_node=writer_resolved.get("values"),
                reader_node=reader_resolved.get("values"),
                path=f"{path}.values",
                writer_namespace=writer_namespace,
                reader_namespace=reader_namespace,
            )
        if writer_kind == "enum":
            return self._compare_enum(writer_resolved, reader_resolved, path)
        if writer_kind == "fixed":
            writer_size = writer_resolved.get("size")
            reader_size = reader_resolved.get("size")
            if writer_size == reader_size:
                return True
            self._add_error(
                path=path,
                issue_type="TYPE_MISMATCH",
                writer_type=f"fixed({writer_size})",
                reader_type=f"fixed({reader_size})",
                description="Fixed type sizes do not match.",
            )
            return False

        self._add_error(
            path=path,
            issue_type="UNSUPPORTED_TYPE",
            writer_type=type_label(writer_resolved),
            reader_type=type_label(reader_resolved),
            description="Unsupported type encountered during compatibility evaluation.",
        )
        return False

    def _named_types_compatible(self, writer_node: dict[str, Any], reader_node: dict[str, Any]) -> bool:
        writer_info = self.writer_registry.node_name_info.get(id(writer_node))
        reader_info = self.reader_registry.node_name_info.get(id(reader_node))
        if not writer_info or not reader_info:
            return False
        if writer_info.fullname == reader_info.fullname:
            return True
        if writer_info.fullname in reader_info.aliases:
            return True
        if reader_info.fullname in writer_info.aliases:
            return True
        return False

    def _compare_record(self, *, writer_record: dict[str, Any], reader_record: dict[str, Any], path: str) -> bool:
        writer_fields = {
            field["name"]: field
            for field in writer_record.get("fields", [])
            if isinstance(field, dict) and isinstance(field.get("name"), str)
        }
        reader_fields = {
            field["name"]: field
            for field in reader_record.get("fields", [])
            if isinstance(field, dict) and isinstance(field.get("name"), str)
        }

        writer_ns = self.writer_registry.namespace_for_node(writer_record)
        reader_ns = self.reader_registry.namespace_for_node(reader_record)
        compatible = True

        for field_name, reader_field in reader_fields.items():
            field_path = f"{path}.{field_name}"
            writer_field = writer_fields.get(field_name)

            if writer_field is None:
                if "default" in reader_field:
                    continue
                issue_type = "MISSING_DEFAULT" if self.direction == "backward" else "REMOVED_FIELD"
                description = (
                    "New field was added without default value."
                    if self.direction == "backward"
                    else "Field was removed from writer schema and reader expects it without default."
                )
                self._add_error(
                    path=field_path,
                    issue_type=issue_type,
                    writer_type="absent",
                    reader_type=type_label(reader_field.get("type")),
                    description=description,
                )
                compatible = False
                continue

            if not self._compare(
                writer_node=writer_field.get("type"),
                reader_node=reader_field.get("type"),
                path=field_path,
                writer_namespace=writer_ns,
                reader_namespace=reader_ns,
            ):
                compatible = False

        return compatible

    def _compare_enum(self, writer_enum: dict[str, Any], reader_enum: dict[str, Any], path: str) -> bool:
        writer_symbols = set(writer_enum.get("symbols", []))
        reader_symbols = set(reader_enum.get("symbols", []))
        missing = sorted(writer_symbols - reader_symbols)
        if not missing:
            return True
        self._add_error(
            path=path,
            issue_type="ENUM_SYMBOL_REMOVED",
            writer_type="enum",
            reader_type="enum",
            description=f"Reader enum is missing writer symbols: {', '.join(missing)}",
        )
        return False

    def _compare_union(
        self,
        *,
        writer_union: list[Any] | None,
        reader_union: list[Any] | None,
        writer_node: Any,
        reader_node: Any,
        path: str,
        writer_namespace: str | None,
        reader_namespace: str | None,
    ) -> bool:
        if writer_union is None and reader_union is not None:
            for branch in reader_union:
                if self._branch_compatible(
                    writer_node=writer_node,
                    reader_node=branch,
                    writer_namespace=writer_namespace,
                    reader_namespace=reader_namespace,
                ):
                    return True
            self._add_error(
                path=path,
                issue_type="UNION_MISMATCH",
                writer_type=type_label(writer_node),
                reader_type="union",
                description="Writer type does not match any reader union branch.",
            )
            return False

        if writer_union is not None and reader_union is None:
            ok = True
            for index, branch in enumerate(writer_union):
                if self._branch_compatible(
                    writer_node=branch,
                    reader_node=reader_node,
                    writer_namespace=writer_namespace,
                    reader_namespace=reader_namespace,
                ):
                    continue
                self._add_error(
                    path=f"{path}[{index}]",
                    issue_type="UNION_MISMATCH",
                    writer_type=type_label(branch),
                    reader_type=type_label(reader_node),
                    description="Writer union branch is not compatible with reader type.",
                )
                ok = False
            return ok

        if writer_union is not None and reader_union is not None:
            ok = True
            for index, writer_branch in enumerate(writer_union):
                branch_ok = any(
                    self._branch_compatible(
                        writer_node=writer_branch,
                        reader_node=reader_branch,
                        writer_namespace=writer_namespace,
                        reader_namespace=reader_namespace,
                    )
                    for reader_branch in reader_union
                )
                if branch_ok:
                    continue
                self._add_error(
                    path=f"{path}[{index}]",
                    issue_type="UNION_MISMATCH",
                    writer_type=type_label(writer_branch),
                    reader_type="union",
                    description="Writer union branch has no compatible branch in reader union.",
                )
                ok = False
            return ok

        return True

    def _branch_compatible(
        self,
        *,
        writer_node: Any,
        reader_node: Any,
        writer_namespace: str | None,
        reader_namespace: str | None,
    ) -> bool:
        branch_engine = CompatibilityEngine(writer_node, reader_node, self.direction)
        branch_engine.writer_registry = self.writer_registry
        branch_engine.reader_registry = self.reader_registry
        branch_engine._compare(
            writer_node=writer_node,
            reader_node=reader_node,
            path="branch",
            writer_namespace=writer_namespace,
            reader_namespace=reader_namespace,
        )
        return len(branch_engine.errors) == 0

    @staticmethod
    def _as_union(node: Any) -> list[Any] | None:
        if isinstance(node, list):
            return node
        if isinstance(node, dict) and isinstance(node.get("type"), list):
            return node.get("type")
        return None

    @staticmethod
    def _kind(node: Any) -> str:
        if isinstance(node, str):
            return "primitive"
        if not isinstance(node, dict):
            return "unknown"
        node_type = node.get("type")
        if node_type in {"null", "boolean", "int", "long", "float", "double", "bytes", "string"}:
            return "primitive"
        if node_type in {"record", "array", "map", "enum", "fixed"}:
            return node_type
        return "unknown"

    @staticmethod
    def _primitive_name(node: Any) -> str:
        if isinstance(node, str):
            return node
        if isinstance(node, dict) and isinstance(node.get("type"), str):
            return node["type"]
        return "unknown"


def check_compatibility(old_schema: Any, new_schema: Any, mode: str) -> list[CompatibilityIssue]:
    mode_clean = mode.strip().lower()
    errors: list[CompatibilityIssue] = []

    if mode_clean in {"backward", "full"}:
        backward = CompatibilityEngine(writer_schema=old_schema, reader_schema=new_schema, direction="backward")
        errors.extend(backward.run())

    if mode_clean in {"forward", "full"}:
        forward = CompatibilityEngine(writer_schema=new_schema, reader_schema=old_schema, direction="forward")
        errors.extend(forward.run())

    return errors
