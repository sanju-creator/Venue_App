import sys
try:
    import docx
except ImportError:
    print("python-docx not installed")
    sys.exit(0)

doc_path = r"c:\Users\DELL\Desktop\VMS Automation\Raw Files\BRD_ Venue System.docx"
try:
    doc = docx.Document(doc_path)
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    print("\n".join(full_text))
except Exception as e:
    print(f"Error: {e}")
