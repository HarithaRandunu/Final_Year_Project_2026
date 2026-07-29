"""
Module 2's bandit policies (Full_Plan.md Section 5).

ThompsonSamplingBandit with gamma=1.0 is vanilla Beta-Bernoulli Thompson
Sampling; gamma<1 is the individual contribution - before folding in each new
observation, an arm's accumulated (alpha, beta) statistics are decayed back
toward the uninformative Beta(1,1) prior, so stale evidence from before a
regime shift stops dominating the posterior. Rewards are continuous headroom
fractions in [0,1], updated via the standard fractional-pseudo-count
extension of Beta-Bernoulli TS (alpha += reward, beta += 1-reward).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


class ThompsonSamplingBandit:
    def __init__(self, gamma: float, seed: int):
        self.gamma = gamma
        self.rng = np.random.default_rng(seed)
        self.alpha: dict = {}
        self.beta: dict = {}
        self.pulls: dict = {}

    def _ensure_arm(self, nodeid) -> None:
        if nodeid not in self.alpha:
            self.alpha[nodeid] = 1.0
            self.beta[nodeid] = 1.0
            self.pulls[nodeid] = 0

    def select(self, candidate_nodeids: list) -> object:
        for n in candidate_nodeids:
            self._ensure_arm(n)
        samples = {n: self.rng.beta(self.alpha[n], self.beta[n]) for n in candidate_nodeids}
        return max(samples, key=samples.get)

    def update(self, nodeid, reward: float) -> None:
        self._ensure_arm(nodeid)
        reward = float(np.clip(reward, 0.0, 1.0))
        self.alpha[nodeid] = 1.0 + self.gamma * (self.alpha[nodeid] - 1.0) + reward
        self.beta[nodeid] = 1.0 + self.gamma * (self.beta[nodeid] - 1.0) + (1.0 - reward)
        self.pulls[nodeid] += 1

    def posterior_mean(self, nodeid) -> float:
        self._ensure_arm(nodeid)
        return self.alpha[nodeid] / (self.alpha[nodeid] + self.beta[nodeid])


def heuristic_select(candidates: pd.DataFrame) -> object:
    """CPU x memory headroom scoring - the bandit's cold-start policy and the
    regret-validation baseline. Deliberately simple, not a second contribution.
    """
    scores = (1 - candidates["cpu"]) * (1 - candidates["mem"])
    return candidates.loc[scores.idxmax(), "nodeid"]
