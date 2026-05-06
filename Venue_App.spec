# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files
from PyInstaller.utils.hooks import copy_metadata

datas = [('Venue_app.py', '.'), ('ml_engine.py', '.'), ('photo_manager.py', '.'), ('logo.png', '.'), ('ui', 'ui'), ('india-maps-data-main', 'india-maps-data-main'), ('Data', 'Data')]
datas += collect_data_files('streamlit')
datas += collect_data_files('plotly')
datas += collect_data_files('pandas')
datas += collect_data_files('numpy')
datas += copy_metadata('streamlit')


a = Analysis(
    ['run_main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=['streamlit'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Venue_App',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Venue_App',
)
