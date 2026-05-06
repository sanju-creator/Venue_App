import pandas as pd
import os

master_path = r"c:\Users\DELL\Desktop\VMS Automation\Data\VMS Master.xlsx"
review_path = r"c:\Users\DELL\Desktop\VMS Automation\Data\Google review and ratings.xlsx"

df_master = pd.read_excel(master_path)
df_review = pd.read_excel(review_path)

df = pd.merge(df_master[['VENUE_CODE', 'VENUE_TYPE', 'REGION', 'NAME', 'COMPLETE_ADDRESS']], 
              df_review[['VENUE_CODE', 'GOOGLE REVIEW COUNT']], 
              on='VENUE_CODE', how='inner')

df = df[df['VENUE_TYPE'].isin(['DOTC', 'DATC'])]
df['GOOGLE REVIEW COUNT'] = pd.to_numeric(df['GOOGLE REVIEW COUNT'], errors='coerce').fillna(0)
df = df.sort_values(by='GOOGLE REVIEW COUNT', ascending=False)

df['REGION_GROUP'] = df['REGION'].apply(lambda x: 'North' if 'NORTH' in str(x).upper() else str(x).capitalize())

final_list = []
target_regions = ['North', 'South', 'East', 'West']

for reg in target_regions:
    for vtype in ['DOTC', 'DATC']:
        subset = df[(df['REGION_GROUP'] == reg) & (df['VENUE_TYPE'] == vtype)]
        # Get top 2
        top_venues = subset.head(2)
        for _, row in top_venues.iterrows():
            final_list.append({
                'Region': reg, 
                'Type': vtype, 
                'Code': row['VENUE_CODE'], 
                'Name': row['NAME'], 
                'Reviews': row['GOOGLE REVIEW COUNT']
            })

print(pd.DataFrame(final_list).to_string(index=False))
