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
lons=[]
lats=[]
texts=[]

def get_centroid(coords):
    # flatten all coordinates
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
        return 0,0
    arr = np.array(flat_coords)
    return float(np.mean(arr[:, 0])), float(np.mean(arr[:, 1]))

for f in gj.get("features", []):
    val_id = str(f.get("properties", {}).get("id", f.get("id", "")))
    state_name = str(f.get("properties", {}).get("st_nm", f.get("id", "")))
    if not val_id:
        val_id = state_name
        
    valid_ids.append(val_id)
    f["id"] = val_id # force mapping
    cx, cy = get_centroid(f["geometry"]["coordinates"])
    lons.append(cx)
    lats.append(cy)
    texts.append(state_name)

df = pd.DataFrame([{"id": v, "val": 10, "state": v} for v in valid_ids])

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
    textfont=dict(color="black", size=10, shadow="1px 1px 1px white"),
    showlegend=False
))

fig.write_html("test_labels_out.html")
print("Done")
