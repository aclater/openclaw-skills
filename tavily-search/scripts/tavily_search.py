#!/usr/bin/env python3
"""
Tavily API search script for OpenClaw.
Performs web searches using the Tavily API with advanced filtering and options.
"""

import os
import sys
import json
import argparse
from typing import Optional
import requests

# API configuration - MUST use environment variable
TAVILY_API_ENDPOINT = "https://api.tavily.com/search"


def search(
    query: str,
    api_key: str,
    include_answer: bool = False,
    max_results: int = 5,
    include_raw_content: bool = False,
    search_depth: str = "advanced",
    topic: str = "general",
) -> dict:
    """
    Perform a Tavily API search.
    
    Args:
        query: Search query string
        api_key: Tavily API key
        include_answer: Include AI-synthesized answer
        max_results: Number of results to return (1-20)
        include_raw_content: Include full page content
        search_depth: 'basic' or 'advanced'
        topic: 'general', 'news', or 'finance'
    
    Returns:
        dict: Search results from Tavily API
    """
    
    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": min(max(max_results, 1), 20),
        "include_answer": include_answer,
        "include_raw_content": include_raw_content,
        "search_depth": search_depth,
        "topic": topic,
    }
    
    try:
        response = requests.post(TAVILY_API_ENDPOINT, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {
            "error": str(e),
            "status": "failed",
            "query": query,
        }


def main():
    parser = argparse.ArgumentParser(
        description="Search the web using Tavily API"
    )
    parser.add_argument("query", help="Search query")
    parser.add_argument(
        "--include-answer",
        action="store_true",
        help="Include AI-synthesized answer",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=5,
        help="Number of results (1-20, default: 5)",
    )
    parser.add_argument(
        "--include-raw-content",
        action="store_true",
        help="Include full page content",
    )
    parser.add_argument(
        "--search-depth",
        choices=["basic", "advanced"],
        default="advanced",
        help="Search depth (default: advanced)",
    )
    parser.add_argument(
        "--topic",
        choices=["general", "news", "finance"],
        default="general",
        help="Search topic (default: general)",
    )
    parser.add_argument(
        "--api-key",
        help="Tavily API key (defaults to TAVILY_KEY env var)",
    )
    
    args = parser.parse_args()
    
    # Get API key from args or env var - REQUIRED
    api_key = args.api_key or os.environ.get("TAVILY_KEY")
    
    if not api_key:
        print("Error: No Tavily API key provided", file=sys.stderr)
        print("Set TAVILY_KEY environment variable or pass --api-key", file=sys.stderr)
        sys.exit(1)
    
    results = search(
        query=args.query,
        api_key=api_key,
        include_answer=args.include_answer,
        max_results=args.max_results,
        include_raw_content=args.include_raw_content,
        search_depth=args.search_depth,
        topic=args.topic,
    )
    
    # Output results as formatted JSON
    print(json.dumps(results, indent=2))
    
    # Return exit code based on success
    sys.exit(0 if "error" not in results else 1)


if __name__ == "__main__":
    main()
