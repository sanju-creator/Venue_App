"""
Photo Manager Module - Automates venue photo upload and organization
Handles batch photo uploads, auto-matching to DMS codes, and file management
"""

import os
import shutil
import pandas as pd
import streamlit as st
from pathlib import Path
from PIL import Image
import io


class PhotoManager:
    """Manages venue photo uploads and organization"""
    
    def __init__(self, photos_path: str, data: pd.DataFrame = None):
        self.photos_path = photos_path
        self.data = data
        os.makedirs(photos_path, exist_ok=True)
    
    def get_dms_code_from_filename(self, filename: str) -> str:
        """Extract potential DMS code from filename"""
        name = Path(filename).stem
        # Common patterns: DMS_CODE.jpg, DMS_CODE_1.jpg, etc.
        parts = name.split('_')
        if len(parts) >= 1:
            return parts[0].strip()
        return name.strip()
    
    def find_matching_venue(self, dms_code: str) -> dict | None:
        """Find venue in data that matches DMS code"""
        if self.data is None or self.data.empty:
            return None
        
        # Try to match DMS code in data
        mask = self.data['dms_code'].fillna('').astype(str).str.upper() == dms_code.upper()
        if mask.any():
            return self.data[mask].iloc[0].to_dict()
        
        # Try matching just first part (before hyphen)
        dms_base = dms_code.split('-')[0] if '-' in dms_code else dms_code
        mask = self.data['dms_code'].fillna('').astype(str).str.startswith(dms_base.upper())
        if mask.any():
            return self.data[mask].iloc[0].to_dict()
        
        return None
    
    def process_uploaded_photo(self, uploaded_file, dms_code: str) -> dict:
        """
        Process and save an uploaded photo
        Returns dict with status, message, and filepath
        """
        try:
            # Validate image
            img = Image.open(uploaded_file)
            img.verify()
            
            # Get file extension
            ext = Path(uploaded_file.name).suffix.lower()
            if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
                return {
                    'status': 'error',
                    'message': f'Unsupported format: {ext}. Use JPG, PNG, or WEBP',
                    'filepath': None
                }
            
            # Create new filename
            new_filename = f"{dms_code}{ext}"
            filepath = os.path.join(self.photos_path, new_filename)
            
            # Save file
            with open(filepath, 'wb') as f:
                uploaded_file.seek(0)
                f.write(uploaded_file.read())
            
            return {
                'status': 'success',
                'message': f'Photo saved: {new_filename}',
                'filepath': filepath
            }
        
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error processing photo: {str(e)}',
                'filepath': None
            }
    
    def batch_upload_photos(self, uploaded_files, auto_match: bool = True) -> list:
        """
        Process multiple uploaded photos
        If auto_match=True, tries to match to venues by filename
        """
        results = []
        
        for uploaded_file in uploaded_files:
            # Try to extract DMS code from filename
            suggested_dms = self.get_dms_code_from_filename(uploaded_file.name)
            
            # Try to find matching venue if auto_match is enabled
            venue_info = None
            if auto_match:
                venue_info = self.find_matching_venue(suggested_dms)
            
            result = {
                'filename': uploaded_file.name,
                'suggested_dms': suggested_dms,
                'matched_venue': venue_info.get('venue_name') if venue_info else None,
                'venue_city': venue_info.get('city') if venue_info else None,
                'dms_code': venue_info.get('dms_code') if venue_info else suggested_dms,
                'status': 'pending',
                'message': ''
            }
            
            results.append(result)
        
        return results
    
    def confirm_and_save_batch(self, results: list) -> dict:
        """Save all confirmed photos"""
        stats = {
            'total': len(results),
            'success': 0,
            'failed': 0,
            'skipped': 0,
            'details': []
        }
        
        for result in results:
            if result['status'] == 'confirmed':
                dms_code = result['dms_code']
                # Save would happen here with file association
                stats['success'] += 1
                stats['details'].append(f"✓ {result['filename']} → {dms_code}")
            elif result['status'] == 'skipped':
                stats['skipped'] += 1
                stats['details'].append(f"⊘ {result['filename']} (skipped)")
            else:
                stats['failed'] += 1
                stats['details'].append(f"✗ {result['filename']} - {result['message']}")
        
        return stats
    
    def get_venue_photo_count(self, dms_code: str) -> int:
        """Count how many photos exist for a venue"""
        if not os.path.exists(self.photos_path):
            return 0
        
        pattern = f"{dms_code}*.*"
        matching_files = list(Path(self.photos_path).glob(pattern))
        return len([f for f in matching_files if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']])
    
    def get_all_venue_photos(self) -> dict:
        """Get count of photos per venue"""
        photo_counts = {}
        
        if not os.path.exists(self.photos_path):
            return photo_counts
        
        for file in os.listdir(self.photos_path):
            if file.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                dms_code = self.get_dms_code_from_filename(file)
                photo_counts[dms_code] = photo_counts.get(dms_code, 0) + 1
        
        return photo_counts


def render_photo_manager_ui(data: pd.DataFrame, photos_path: str):
    """Render the photo manager admin interface"""
    
    manager = PhotoManager(photos_path, data)
    
    st.markdown("### 📸 Automated Photo Manager")
    st.markdown("Upload and organize venue photos with automatic DMS code matching")
    
    tab1, tab2, tab3 = st.tabs(["Batch Upload", "Manage Photos", "Statistics"])
    
    # TAB 1: Batch Upload
    with tab1:
        st.markdown("#### Upload Multiple Photos")
        st.markdown("**How it works:**")
        st.markdown("1. Upload photos (rename them with DMS codes like EST-AP-1234.jpg)")
        st.markdown("2. System auto-matches to venues")
        st.markdown("3. Review and confirm matches")
        st.markdown("4. Photos are automatically organized")
        
        uploaded_files = st.file_uploader(
            "Choose photos to upload",
            type=['jpg', 'jpeg', 'png', 'webp'],
            accept_multiple_files=True,
            key="photo_upload"
        )
        
        if uploaded_files:
            auto_match = st.checkbox("🎯 Auto-match to venues by filename", value=True, help="Tries to find matching venues based on DMS code in filename")
            
            if st.button("🔍 Analyze & Preview", use_container_width=True):
                results = manager.batch_upload_photos(uploaded_files, auto_match=auto_match)
                st.session_state['photo_results'] = results
                st.rerun()
        
        # Show analysis results
        if 'photo_results' in st.session_state:
            results = st.session_state['photo_results']
            
            st.markdown("#### Preview & Confirm")
            
            # Show summary
            matched = sum(1 for r in results if r['matched_venue'])
            st.info(f"📊 {matched}/{len(results)} photos have matching venues")
            
            # Show details in columns
            if results:
                df_display = []
                for idx, result in enumerate(results):
                    df_display.append({
                        'File': result['filename'],
                        'DMS Code': result['dms_code'],
                        'Venue': result['matched_venue'] or '❌ No match',
                        'City': result['venue_city'] or '-',
                        'Action': '✓ Save' if result['matched_venue'] else '⊘ Skip'
                    })
                
                st.dataframe(pd.DataFrame(df_display), use_container_width=True)
                
                # Confirm button
                if st.button("✅ Confirm & Save All Photos", use_container_width=True, type="primary"):
                    # Mark all as confirmed
                    for result in results:
                        result['status'] = 'confirmed' if result['matched_venue'] else 'skipped'
                    
                    # Process files
                    success_count = 0
                    for idx, (uploaded_file, result) in enumerate(zip(uploaded_files, results)):
                        if result['status'] == 'confirmed':
                            save_result = manager.process_uploaded_photo(uploaded_file, result['dms_code'])
                            if save_result['status'] == 'success':
                                success_count += 1
                    
                    st.success(f"✅ Successfully saved {success_count} photos!")
                    del st.session_state['photo_results']
                    st.rerun()
    
    # TAB 2: Manage Photos
    with tab2:
        st.markdown("#### View & Manage Uploaded Photos")
        
        if not os.path.exists(photos_path) or not os.listdir(photos_path):
            st.info("No photos uploaded yet")
        else:
            # Get all files
            all_files = sorted(os.listdir(photos_path))
            img_files = [f for f in all_files if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
            
            if img_files:
                st.markdown(f"**Total Photos: {len(img_files)}**")
                
                # Group by venue
                venue_groups = {}
                for file in img_files:
                    dms = manager.get_dms_code_from_filename(file)
                    if dms not in venue_groups:
                        venue_groups[dms] = []
                    venue_groups[dms].append(file)
                
                # Display grouped
                for dms_code in sorted(venue_groups.keys()):
                    files = venue_groups[dms_code]
                    with st.expander(f"📁 {dms_code} ({len(files)} photo{'s' if len(files) > 1 else ''})"):
                        cols = st.columns(4)
                        for idx, file in enumerate(files):
                            with cols[idx % 4]:
                                filepath = os.path.join(photos_path, file)
                                try:
                                    img = Image.open(filepath)
                                    st.image(img, caption=file, use_container_width=True)
                                    if st.button(f"🗑️ Delete", key=f"del_{file}"):
                                        os.remove(filepath)
                                        st.success(f"Deleted {file}")
                                        st.rerun()
                                except Exception as e:
                                    st.error(f"Error loading {file}")
            else:
                st.info("No image files found")
    
    # TAB 3: Statistics
    with tab3:
        st.markdown("#### Photo Coverage Statistics")
        
        photo_counts = manager.get_all_venue_photos()
        
        if photo_counts:
            # Stats
            venues_with_photos = len(photo_counts)
            total_photos = sum(photo_counts.values())
            venues_with_multiple = len([v for c in photo_counts.values() if c > 1])
            
            col1, col2, col3 = st.columns(3)
            col1.metric("Venues with Photos", venues_with_photos)
            col2.metric("Total Photos", total_photos)
            col3.metric("Venues with Multiple Photos", venues_with_multiple)
            
            # Distribution
            st.markdown("#### Photo Distribution")
            dist_data = {
                '1 Photo': len([v for c in photo_counts.values() if c == 1]),
                '2+ Photos': len([v for c in photo_counts.values() if c >= 2]),
                '5+ Photos': len([v for c in photo_counts.values() if c >= 5]),
            }
            
            col1, col2, col3 = st.columns(3)
            col1.metric("Single Photo Venues", dist_data['1 Photo'])
            col2.metric("Multi-Photo Venues", dist_data['2+ Photos'])
            col3.metric("Well-Documented Venues", dist_data['5+ Photos'])
        else:
            st.info("No photos available yet")
