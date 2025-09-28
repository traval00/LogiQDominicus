import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange

FEATS = [
    'ret1','ret3','ret5',
    'ema10','ema20','ema200',
    'ema_slope20','ema_dist20',
    'rsi','atr',
    'orb_high_dist','orb_low_dist',
    'brk_orb_high','rt_orb_high'
]

def _series(col):
    if isinstance(col, pd.DataFrame):
        return col.iloc[:, -1]
    return col

def _find_col(df: pd.DataFrame, candidates):
    cols_lower = [str(c).lower() for c in df.columns]
    for name in candidates:
        key = name.lower()
        # exact match
        if key in cols_lower:
            idx = cols_lower.index(key)
            return _series(df.iloc[:, idx])
        # allow suffixed names (close_spy) and general contains
        for i, c in enumerate(cols_lower):
            if c == f"{key}_spy" or c.endswith(f"_{key}") or c.startswith(f"{key}_") or (key in c):
                return _series(df.iloc[:, i])
    return None

def _normalize(df_in: pd.DataFrame) -> pd.DataFrame:
    df = df_in.copy()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = ['_'.join([str(x) for x in tup if str(x)!='']) for tup in df.columns]
    df.columns = [str(c).strip().lower() for c in df.columns]
    df = df.loc[:, ~pd.Index(df.columns).duplicated(keep='last')]
    return df

def make_features(df15: pd.DataFrame) -> pd.DataFrame:
    if df15 is None or len(df15) == 0:
        raise ValueError("make_features: empty dataframe passed in")

    df = _normalize(df15)

    c = _find_col(df, ['close', 'adj close', 'adj_close', 'adjclose'])
    h = _find_col(df, ['high'])
    l = _find_col(df, ['low'])
    if c is None or h is None or l is None:
        raise ValueError(f"make_features: required columns missing. Have: {list(df.columns)}")

    # returns
    df['ret1'] = c.pct_change(1)
    df['ret3'] = c.pct_change(3)
    df['ret5'] = c.pct_change(5)

    # EMAs
    df['ema10'] = c.ewm(span=10, adjust=False).mean()
    df['ema20'] = c.ewm(span=20, adjust=False).mean()
    df['ema200'] = c.ewm(span=200, adjust=False).mean()
    df['ema_slope20'] = _series(df['ema20']).diff()
    ema20 = _series(df['ema20'])
    df['ema_dist20'] = (c - ema20) / ema20

    # RSI & ATR
    df['rsi'] = RSIIndicator(c, window=14).rsi()
    atr = AverageTrueRange(h, l, c, window=14)
    df['atr'] = atr.average_true_range()

    # ORB (first bar per session) – index-safe
    d = df.copy()
    try:
        dates = pd.to_datetime(d.index).tz_localize(None).date
    except Exception:
        dates = pd.to_datetime(d.index).date
    d['_d'] = dates

    if 'high' not in d.columns:
        d['high'] = h
    if 'low' not in d.columns:
        d['low'] = l

    d['orb_high'] = d.groupby('_d')['high'].transform('first')
    d['orb_low']  = d.groupby('_d')['low'].transform('first')

    df['orb_high'] = _series(d['orb_high'])
    df['orb_low']  = _series(d['orb_low'])

    # distances & simple breakout/retest flags
    df['orb_high_dist'] = (c - _series(df['orb_high'])) / _series(df['orb_high'])
    df['orb_low_dist']  = (c - _series(df['orb_low']))  / _series(df['orb_low'])
    df['brk_orb_high'] = (c > _series(df['orb_high'])).astype(int)
    tol_up = _series(df['orb_high']) * 0.0025  # ~0.25%
    df['rt_orb_high'] = ((l <= _series(df['orb_high']) + tol_up) &
                         (l >= _series(df['orb_high']) - tol_up)).astype(int)

    df = df.replace([np.inf, -np.inf], np.nan).dropna()
    return df

def label_forward_returns(df15: pd.DataFrame, horizon_bars: int = 26, tp_r: float = 2.0, sl_r: float = 1.0):
    dfn = _normalize(df15)
    c = _find_col(dfn, ['close', 'adj close', 'adj_close', 'adjclose'])
    if c is None:
        raise ValueError("label_forward_returns: no close/adj close column found")
    fwd = c.pct_change(horizon_bars).shift(-horizon_bars)
    return (fwd > 0).astype(int)
