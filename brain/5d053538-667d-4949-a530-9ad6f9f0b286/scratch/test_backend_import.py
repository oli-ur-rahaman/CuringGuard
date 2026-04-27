try:
    from backend.app.main import app
    print("Backend import successful! No syntax or import errors.")
except Exception as e:
    import traceback
    print("Backend failed to import:")
    traceback.print_exc()
