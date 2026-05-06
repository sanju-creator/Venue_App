import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import json
import numpy as np

INDIA_GEOJSON_PATH = "C:\\Users\\DELL\\Desktop\\VMS Automation\\india-maps-data-main\\geojson\\india.geojson"
with open(INDIA_GEOJSON_PATH, "r", encoding="utf-8") as f:
    gj = json.load(f)

# Mock data
valid_ids = []

def _get_feature_centroid(feature: dict) -> tuple[float, float]:
    geom = feature.get("geometry", {})
    if not geom:
        return 0.0, 0.0
    coords = geom.get("coordinates", [])
    flat_coords = []

    def extract_coords(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            flat_coords.append(c)
        else:
            for item in c:
                extract_coords(item)
    extract_coords(coords)
    
    if not flat_coords:
        return 0.0, 0.0
    arr = np.array(flat_coords)
    return float(np.mean(arr[:, 0])), float(np.mean(arr[:, 1]))

id_to_name = {}
for f in gj.get("features", []):
    val_id = str(f.get("properties", {}).get("id", f.get("id", "")))
    state_name = str(f.get("properties", {}).get("st_nm", f.get("id", "")))
    if not val_id:
        val_id = state_name
        
    f["id"] = val_id # force mapping
    id_to_name[val_id] = state_name

df = pd.DataFrame([{"id": v, "val": 10, "state": s} for v, s in id_to_name.items()])

state_to_coords = {}
for f in gj.get("features", []):
    fid = f.get("id")
    if fid in id_to_name:
        state_name = id_to_name[fid]
        geom = f.get("geometry", {})
        if geom:
            if state_name not in state_to_coords:
                state_to_coords[state_name] = []
            state_to_coords[state_name].append(geom.get("coordinates", []))

HIDE_LABELS = {
    "Dadra and Nagar Haveli and Daman and Diu", 
    "Chandigarh", 
    "Puducherry", 
    "Lakshadweep",
    "Goa"
}
LABEL_ALIASES = {
    "Andaman and Nicobar Islands": "A & N Islands",
    "Jammu and Kashmir": "J & K",
}

lons = []
lats = []
texts = []
for state_name, coords_list in state_to_coords.items():
    if state_name in HIDE_LABELS:
        continue
    cx, cy = _get_feature_centroid({"geometry": {"coordinates": coords_list}})
    if cx != 0.0 and cy != 0.0:
        lons.append(cx)
        lats.append(cy)
        texts.append(LABEL_ALIASES.get(state_name, state_name))

fig = px.choropleth(
    df,
    geojson=gj,
    locations="id",
    featureidkey="id", 
    color="val",
)
fig.update_geos(fitbounds="locations", visible=False)

fig.add_trace(go.Scattergeo(
    lon=lons,
    lat=lats,
    text=texts,
    mode="text",
    textfont=dict(color="black", size=10),
    showlegend=False
))

fig.write_html("test_state_labels_out.html")
print("Total labels generated:", len(texts))
print("Done")
