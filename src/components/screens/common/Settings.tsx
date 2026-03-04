import React, { useState, useRef } from 'react';
import { SectionHeader } from '../../common/SectionHeader';
import { Card } from '../../common/Card';
import { Camera, Trash2, Upload } from 'lucide-react';

interface SettingsProps {
  onPasswordChanged?: () => void;
  onProfilePictureChanged?: (pic: string | null) => void;
}

export const Settings = ({ onPasswordChanged, onProfilePictureChanged }: SettingsProps) => {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
  const [profilePic, setProfilePic] = useState<string | null>(user.profile_picture || null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ currentPassword: current, newPassword: newPass }) });
      const data = await res.json();
      if (res.ok) { (window as any).notify('Password changed', 'success'); setCurrent(''); setNewPass(''); if (onPasswordChanged) onPasswordChanged(); }
      else (window as any).notify(data.error || 'Failed to change password', 'error');
    } catch (err) { (window as any).notify('Connection error', 'error'); }
    setLoading(false);
  };

  const handleProfileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { (window as any).notify?.('Please upload an image file', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { (window as any).notify?.('Image must be under 2 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setUploading(true);
      try {
        const token = localStorage.getItem('talentflow_token');
        const res = await fetch('/api/profile-picture', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ profile_picture: dataUrl }),
        });
        if (res.ok) {
          setProfilePic(dataUrl);
          onProfilePictureChanged?.(dataUrl);
          (window as any).notify?.('Profile picture updated', 'success');
        } else { (window as any).notify?.('Failed to upload', 'error'); }
      } catch { (window as any).notify?.('Connection error', 'error'); }
      setUploading(false);
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRemovePic = async () => {
    setUploading(true);
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/profile-picture', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ profile_picture: null }),
      });
      if (res.ok) {
        setProfilePic(null);
        onProfilePictureChanged?.(null);
        (window as any).notify?.('Profile picture removed', 'success');
      } else { (window as any).notify?.('Failed to remove', 'error'); }
    } catch { (window as any).notify?.('Connection error', 'error'); }
    setUploading(false);
  };

  return (
    <div>
      <SectionHeader title="Settings" subtitle="Your account and preferences" />
      <div className="grid grid-cols-1 gap-4">

        {/* Profile Picture */}
        <Card>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4">Profile Picture</h3>
          <div className="flex items-center gap-6">
            <div className="relative group">
              {profilePic ? (
                <img src={profilePic} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                  <Camera size={24} className="text-slate-400" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 w-20 h-20 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              >
                <Upload size={18} className="text-white" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-teal-deep text-white rounded-xl hover:bg-teal-green transition-colors disabled:opacity-50"
              >
                <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload Photo'}
              </button>
              {profilePic && (
                <button
                  type="button"
                  onClick={handleRemovePic}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
              <p className="text-[10px] text-slate-400">Max 2 MB. JPG, PNG, or GIF.</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleProfileUpload} />
        </Card>

        {/* Change Password */}
        <Card>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4">Change Password</h3>
          <form onSubmit={handleChange} className="space-y-3 max-w-sm">
            <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" required />
            <input type="password" placeholder="New password" value={newPass} onChange={e => setNewPass(e.target.value)} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" required />
            <button type="submit" className="px-4 py-2.5 bg-teal-deep text-white rounded-xl text-sm font-bold hover:bg-teal-green transition-colors" disabled={loading}>{loading ? 'Saving...' : 'Change Password'}</button>
          </form>
        </Card>

        {/* Preferences */}
        <Card>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2">Preferences</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Theme toggle is available in the sidebar.</p>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
