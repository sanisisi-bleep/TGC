from __future__ import annotations

from itertools import combinations
from random import Random


def _pair_key(left: int, right: int) -> tuple[int, int]:
    return (left, right) if left < right else (right, left)


def _group_pairs(group: list[int]) -> set[tuple[int, int]]:
    return {_pair_key(left, right) for left, right in combinations(group, 2)}


def _build_week(
    player_ids: list[int],
    used_pairs: set[tuple[int, int]],
    randomizer: Random,
) -> list[list[int]] | None:
    remaining = list(player_ids)
    randomizer.shuffle(remaining)
    groups: list[list[int]] = []

    def backtrack(current_remaining: list[int]) -> bool:
        if not current_remaining:
            return True

        anchor = current_remaining[0]
        other_players = current_remaining[1:]
        candidate_groups = []

        for triple in combinations(other_players, 3):
            group = [anchor, *triple]
            if _group_pairs(group) & used_pairs:
                continue
            candidate_groups.append(group)

        randomizer.shuffle(candidate_groups)
        candidate_groups.sort(
            key=lambda group: sum(
                1
                for pair in _group_pairs(group)
                if pair in used_pairs
            )
        )

        for group in candidate_groups:
            next_remaining = [player_id for player_id in current_remaining if player_id not in group]
            groups.append(group)
            if backtrack(next_remaining):
                return True
            groups.pop()

        return False

    return groups if backtrack(remaining) else None


def generate_schedule(
    player_ids: list[int],
    requested_weeks: int,
    *,
    seed: int | None = None,
    max_attempts: int = 200,
) -> list[list[list[int]]]:
    if requested_weeks <= 0:
        return []

    player_count = len(player_ids)
    if player_count < 4:
        raise ValueError("Se necesitan al menos 4 jugadores para generar jornadas.")
    if player_count % 4 != 0:
        raise ValueError("El numero de jugadores activos debe ser multiplo de 4 para este formato.")

    theoretical_max_weeks = max((player_count - 1) // 3, 0)
    target_weeks = min(requested_weeks, theoretical_max_weeks)
    if target_weeks == 0:
        return []

    randomizer = Random(seed)
    best_schedule: list[list[list[int]]] = []

    for _attempt in range(max_attempts):
        used_pairs: set[tuple[int, int]] = set()
        partial_schedule: list[list[list[int]]] = []

        for _week_index in range(target_weeks):
            week = _build_week(player_ids, used_pairs, randomizer)
            if not week:
                break

            partial_schedule.append(week)
            for group in week:
                used_pairs.update(_group_pairs(group))

        if len(partial_schedule) > len(best_schedule):
            best_schedule = partial_schedule

        if len(best_schedule) == target_weeks:
            break

    return best_schedule

