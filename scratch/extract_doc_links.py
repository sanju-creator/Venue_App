import os
import re

def find_urls_in_binary(file_path):
    if not os.path.exists(file_path):
        return []
    try:
        with open(file_path, 'rb') as f:
            content = f.read()
            # Look for http/https URLs using regex on the raw bytes
            urls = re.findall(b'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', content)
            return [url.decode('utf-8', errors='ignore') for url in urls]
    except:
        return []

files = [
    r"c:\Users\DELL\Desktop\VMS Automation\Raw Files\BRD_ Venue System.docx",
    r"c:\Users\DELL\Desktop\VMS Automation\Raw Files\SOP -  Venue Data Analytics & Intelligence.pptx"
]

for f in files:
    print(f"\nURLs in {os.path.basename(f)}:")
    urls = find_urls_in_binary(f)
    # Deduplicate and filter (ignore common XML schema URLs)
    unique_urls = sorted(list(set(urls)))
    for url in unique_urls:
        if 'schemas.' not in url and 'purl.org' not in url and 'w3.org' not in url:
            print(url)
