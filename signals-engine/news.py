import os, requests
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()

def sentiment_for(ticker: str, limit: int = 10):
    # If a NEWS_API_KEY is present, fetch headlines and score; else neutral 0.0
    key = os.getenv('NEWS_API_KEY')
    if not key:
        return 0.0
    try:
        url = f'https://newsapi.org/v2/everything?q={ticker}&pageSize={limit}&sortBy=publishedAt&language=en&apiKey={key}'
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        items = r.json().get('articles', [])
        if not items:
            return 0.0
        scores = [analyzer.polarity_scores(a.get('title',''))['compound'] for a in items]
        return float(sum(scores)/len(scores))
    except Exception:
        return 0.0
