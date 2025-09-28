import os, requests
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
analyzer = SentimentIntensityAnalyzer()
def sentiment_for(ticker, limit=10):
    key = os.getenv('NEWS_API_KEY')
    if not key: return 0.0
    try:
        url = f'https://newsapi.org/v2/everything?q={ticker}&pageSize={limit}&sortBy=publishedAt&language=en&apiKey={key}'
        items = requests.get(url, timeout=10).json().get('articles', [])
        if not items: return 0.0
        scores = [analyzer.polarity_scores(a.get('title',''))['compound'] for a in items]
        return float(sum(scores)/len(scores))
    except Exception:
        return 0.0
