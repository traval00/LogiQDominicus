import datetime as dt, yfinance as yf

def pick_option_contract(ticker, direction, moneyness_pct=5.0, days_min=7, days_max=14):
    try:
        tk = yf.Ticker(ticker)
        exps = [dt.datetime.strptime(d, '%Y-%m-%d').date() for d in tk.options]
        today = dt.date.today()
        exps = [d for d in exps if days_min <= (d - today).days <= days_max]
        if not exps: return None
        exp = sorted(exps)[0]
        spot = tk.fast_info.get('last_price') or tk.history(period='1d')['Close'].iloc[-1]
        if direction.upper()=='BUY':
            target = spot*(1+moneyness_pct/100); chain = tk.option_chain(exp.isoformat()).calls
        else:
            target = spot*(1-moneyness_pct/100); chain = tk.option_chain(exp.isoformat()).puts
        if chain.empty: return None
        chain['dist'] = (chain['strike']-target).abs()
        row = chain.sort_values('dist').iloc[0]
        return {'expiration':exp.isoformat(),'strike':float(row['strike']),'symbol':row.get('contractSymbol',''),
                'last':float(row.get('lastPrice',0.0)),'bid':float(row.get('bid',0.0)),'ask':float(row.get('ask',0.0))}
    except Exception:
        return None
