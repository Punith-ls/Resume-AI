"""Lightweight JSON document store with a Mongo-like async API."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional

from bson import ObjectId


def _oid(value: Any) -> str:
    return str(value)


def _match(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    if not query:
        return True
    for key, expected in query.items():
        actual = doc.get(key)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$eq" in expected and actual != expected["$eq"]:
                return False
            continue
        if key == "_id" or isinstance(expected, ObjectId) or isinstance(actual, ObjectId):
            if _oid(actual) != _oid(expected):
                return False
        elif actual != expected:
            return False
    return True


class InsertResult:
    def __init__(self, inserted_id: Any):
        self.inserted_id = inserted_id


class DeleteResult:
    def __init__(self, deleted_count: int):
        self.deleted_count = deleted_count


class FileCursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = docs

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        if length is None:
            return deepcopy(self._docs)
        return deepcopy(self._docs[:length])


class FileCollection:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._docs: List[Dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            self._docs = []
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8") or "[]")
            self._docs = raw if isinstance(raw, list) else []
        except Exception:
            self._docs = []

    def _dump(self) -> Any:
        def convert(value: Any) -> Any:
            if isinstance(value, ObjectId):
                return str(value)
            if isinstance(value, dict):
                return {k: convert(v) for k, v in value.items()}
            if isinstance(value, list):
                return [convert(v) for v in value]
            return value

        return convert(self._docs)

    def _save(self) -> None:
        self.path.write_text(json.dumps(self._dump(), indent=2, default=str), encoding="utf-8")

    def find(self, query: Optional[Dict[str, Any]] = None) -> FileCursor:
        query = query or {}
        return FileCursor([doc for doc in self._docs if _match(doc, query)])

    async def find_one(self, query: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        query = query or {}
        for doc in self._docs:
            if _match(doc, query):
                return deepcopy(doc)
        return None

    async def insert_one(self, document: Dict[str, Any]) -> InsertResult:
        doc = deepcopy(document)
        if "_id" not in doc:
            doc["_id"] = str(ObjectId())
        else:
            doc["_id"] = str(doc["_id"])
        self._docs.append(doc)
        self._save()
        return InsertResult(doc["_id"])

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]) -> None:
        for index, doc in enumerate(self._docs):
            if not _match(doc, query):
                continue
            updated = deepcopy(doc)
            if "$set" in update:
                for key, value in update["$set"].items():
                    if "." in key:
                        parts = key.split(".")
                        cursor = updated
                        for part in parts[:-1]:
                            next_val = cursor.get(part)
                            if not isinstance(next_val, dict):
                                cursor[part] = {}
                            cursor = cursor[part]
                        cursor[parts[-1]] = value
                    else:
                        updated[key] = value
            if "$push" in update:
                for key, value in update["$push"].items():
                    updated.setdefault(key, [])
                    if not isinstance(updated[key], list):
                        updated[key] = [updated[key]]
                    updated[key].append(value)
            self._docs[index] = updated
            self._save()
            return

    async def delete_many(self, query: Dict[str, Any]) -> Dict[str, int]:
        before = len(self._docs)
        self._docs = [doc for doc in self._docs if not _match(doc, query)]
        deleted = before - len(self._docs)
        if deleted:
            self._save()
        return DeleteResult(deleted)

    async def create_index(self, *args, **kwargs) -> None:
        return None


class FileDatabase:
    def __init__(self, data_dir: Path):
        data_dir.mkdir(parents=True, exist_ok=True)
        self.candidates = FileCollection(data_dir / "candidates.json")
        self.recruiters = FileCollection(data_dir / "recruiters.json")
        self.jobs = FileCollection(data_dir / "jobs.json")
        self.shortlisted_candidates = FileCollection(data_dir / "shortlisted.json")
        self.engine = "file"
