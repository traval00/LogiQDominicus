from dataclasses import dataclass
import pandas as pd
import numpy as np
from ta.volatility import AverageTrueRange

@dataclass
class StrategyParams:
    ema_fast:int=10
    ema_mid:int=20
    ema_slow:int=200
    rsi_len:int=14
    orb_window_min:int=15
    retest_tol_pct:float=0.25
    atr_len:int=14

def opening_range(df15: pd.DataFrame, orb_min:int=15) -> pd.DataFrame:
    g = df15.copy()
    g['date'] = g.index.tz_localize(None).date
    first_bar = g.reset_index().groupby('date').head(1).set_index('Datetime')
    orb = first_bar[['high','low']].rename(columns={'high':'orb_high','low':'orb_low'})
    return orb

def break_and_retest(df15: pd.DataFrame, retest_tol_pct: float, level_col: str) -> pd.Series:
    lvl = df15[level_col]; close = df15['close']
    broke_up = (close > lvl)
    tol_hi = lvl * (1 + retest_tol_pct/100.0)
    tol_lo = lvl * (1 - retest_tol_pct/100.0)
    retest = (df15['low'] <= tol_hi) & (df15['low'] >= tol_lo)
    return (broke_up.shift(1).fillna(False)) & retest

def trailing_stop_series(df: pd.DataFrame, ema_col='ema20', atr_col='atr', atr_mult=1.0):
    base = df[ema_col] - df[atr_col]*atr_mult
    return base.clip(upper=df['close'])
