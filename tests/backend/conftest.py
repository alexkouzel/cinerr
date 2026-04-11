import sys, os

# Add backend/ to the import path so tests can import modules directly.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
