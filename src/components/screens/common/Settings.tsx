import React, { useState, useRef, useEffect } from 'react';
import { SectionHeader } from '../../common/SectionHeader';
import { Card } from '../../common/Card';
import Modal from '../../common/Modal';
import { Camera, Trash2, Upload, Save, Mail, Phone, MapPin, Briefcase, Building2, Calendar, Shield, Edit3, X } from 'lucide-react';

interface SettingsProps {
  onPasswordChanged?: () => void;
  onProfilePictureChanged?: (pic: string | null) => void;
  onAccountInfoChanged?: (info: { full_name?: string; employee_name?: string; email?: string; position?: string; dept?: string }) => void;
}

export const Settings = ({ onPasswordChanged, onProfilePictureChanged, onAccountInfoChanged }: SettingsProps) => {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
  const [profilePic, setProfilePic] = useState<string | null>(user.profile_picture || null);
  const [uploading, setUploading] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isProfileAccountModalOpen, setIsProfileAccountModalOpen] = useState(false);
  const [isAdjustPhotoModalOpen, setIsAdjustPhotoModalOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);

  // Account info state
  const [accountInfo, setAccountInfo] = useState({
    email: '', phone: '', address: '',
    employee_name: '', position: '', dept: '', hire_date: '', status: '', role: '', username: ''
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [editing, setEditing] = useState(false);
  const hasEmployee = !!user.employee_id;
  const normalizedRole = String(user.role || '').trim().toLowerCase();
  const canEditAccountInfo = normalizedRole === 'hr' || normalizedRole === 'hr admin' || normalizedRole === 'hr_admin';

  useEffect(() => {
    const fetchAccountInfo = async () => {
      try {
        const token = localStorage.getItem('talentflow_token');
        const res = await fetch('/api/account-info', { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (res.ok) {
          const data = await res.json();
          setAccountInfo({
            email: data.email || data.username || user.email || user.username || '', phone: data.phone || '', address: data.address || '',
            employee_name: data.name || data.employee_name || user.employee_name || '',
            position: data.position || user.position || '', dept: data.dept || user.dept || '',
            hire_date: data.hire_date || '', status: data.status || '', role: data.role || user.role || '',
            username: data.username || user.username || ''
          });
        }
      } catch {}
    };
    fetchAccountInfo();
  }, []);

  const saveAccountInfo = async () => {
    if (!canEditAccountInfo) {
      (window as any).notify?.('Only HR admin can edit account information', 'error');
      return;
    }
    setSavingInfo(true);
    try {
      const token = localStorage.getItem('talentflow_token');
      const body: any = { email: accountInfo.email, phone: accountInfo.phone, address: accountInfo.address };
      // allow updating basic profile fields as well
      body.employee_name = accountInfo.employee_name;
      body.position = accountInfo.position;
      body.dept = accountInfo.dept;

      const res = await fetch('/api/account-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        // Update localStorage cache for user profile
        const cached = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
        cached.email = data.email || cached.email; cached.phone = data.phone || cached.phone; cached.address = data.address || cached.address;
        if (data.name) { cached.employee_name = data.name; cached.full_name = data.name; }
        if (data.position) { cached.position = data.position; }
        if (data.dept) { cached.dept = data.dept; }
        if (data.full_name) { cached.full_name = data.full_name; }
        localStorage.setItem('talentflow_user', JSON.stringify(cached));
        localStorage.setItem('user', JSON.stringify(cached));
        onAccountInfoChanged?.({
          full_name: data.name || data.full_name || cached.full_name,
          employee_name: data.name || cached.employee_name,
          email: data.email || cached.email,
          position: data.position || cached.position,
          dept: data.dept || cached.dept,
        });
        // refresh UI state from server response
        setAccountInfo({
          ...accountInfo,
          email: data.email || accountInfo.email,
          phone: data.phone || accountInfo.phone,
          address: data.address || accountInfo.address,
          employee_name: data.name || accountInfo.employee_name,
          position: data.position || accountInfo.position,
          dept: data.dept || accountInfo.dept,
        });
        (window as any).notify?.('Account information updated', 'success');
      } else { (window as any).notify?.('Failed to update', 'error'); }
    } catch { (window as any).notify?.('Connection error', 'error'); }
    setSavingInfo(false);
  };

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentPassword = current.trim();
    const nextPassword = newPass.trim();
    if (!currentPassword || !nextPassword) {
      (window as any).notify('Please provide current and new password', 'error');
      return;
    }
    if (nextPassword.length < 8 || nextPassword.length > 128) {
      (window as any).notify('New password must be 8 to 128 characters', 'error');
      return;
    }
    if (currentPassword === nextPassword) {
      (window as any).notify('New password must be different from current password', 'error');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ currentPassword, newPassword: nextPassword }) });
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
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPendingPhoto(dataUrl);
      setPhotoZoom(1);
      setPhotoOffsetX(0);
      setPhotoOffsetY(0);
      setIsAdjustPhotoModalOpen(true);
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const cancelAdjustPhoto = () => {
    if (uploading) return;
    setIsAdjustPhotoModalOpen(false);
    setPendingPhoto(null);
    setPhotoZoom(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
  };

  const applyAndUploadAdjustedPhoto = async () => {
    if (!pendingPhoto) return;

    setUploading(true);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to load image for adjustment'));
        img.src = pendingPhoto;
      });

      const canvas = document.createElement('canvas');
      const targetSize = 512;
      canvas.width = targetSize;
      canvas.height = targetSize;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not supported');

      const baseScale = Math.max(targetSize / image.width, targetSize / image.height);
      const drawScale = baseScale * photoZoom;
      const drawWidth = image.width * drawScale;
      const drawHeight = image.height * drawScale;
      const drawX = (targetSize - drawWidth) / 2 + photoOffsetX;
      const drawY = (targetSize - drawHeight) / 2 + photoOffsetY;

      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      const adjustedDataUrl = canvas.toDataURL('image/jpeg', 0.92);

      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/profile-picture', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ profile_picture: adjustedDataUrl }),
      });

      if (res.ok) {
        setProfilePic(adjustedDataUrl);
        onProfilePictureChanged?.(adjustedDataUrl);
        setIsAdjustPhotoModalOpen(false);
        setPendingPhoto(null);
        (window as any).notify?.('Profile picture updated', 'success');
      } else {
        (window as any).notify?.('Failed to upload', 'error');
      }
    } catch {
      (window as any).notify?.('Connection error', 'error');
    }
    setUploading(false);
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
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                {profilePic ? (
                  <button
                    type="button"
                    onClick={() => setIsPhotoModalOpen(true)}
                    className="block rounded-full focus:outline-none focus:ring-2 focus:ring-teal-green/40"
                    aria-label="View profile picture"
                  >
                    <img src={profilePic} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700" />
                  </button>
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
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{user.employee_name || user.full_name || user.username || user.email}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">{user.role}</p>
                {user.position && <p className="text-[10px] text-slate-400 dark:text-slate-500">{user.position}</p>}
                {user.dept && <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">{user.dept}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {profilePic && (
                <button
                  type="button"
                  onClick={() => setIsPhotoModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Camera size={14} /> View Photo
                </button>
              )}
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

        {/* Account Information */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Account Information</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsProfileAccountModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Camera size={12} /> View Profile + Account
              </button>
              {!editing && canEditAccountInfo && (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <Edit3 size={12} /> Edit
                </button>
              )}
            </div>
          </div>
          {!canEditAccountInfo && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Only HR admin can edit account information.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="flex items-center gap-3">
              <Briefcase size={16} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Full Name</p>
                {editing && canEditAccountInfo ? (
                  <input value={accountInfo.employee_name} onChange={e => setAccountInfo({ ...accountInfo, employee_name: e.target.value })} className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" />
                ) : (
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.employee_name || '—'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail size={16} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Email</p>
                {editing && canEditAccountInfo ? (
                  <input value={accountInfo.email} onChange={e => setAccountInfo({ ...accountInfo, email: e.target.value })} className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" />
                ) : (
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.email || '—'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Building2 size={16} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Department</p>
                {editing && hasEmployee && canEditAccountInfo ? (
                  <input value={accountInfo.dept} onChange={e => setAccountInfo({ ...accountInfo, dept: e.target.value })} className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" />
                ) : (
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.dept || '—'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Briefcase size={16} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Position</p>
                {editing && hasEmployee && canEditAccountInfo ? (
                  <input value={accountInfo.position} onChange={e => setAccountInfo({ ...accountInfo, position: e.target.value })} className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" />
                ) : (
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.position || '—'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield size={16} className="text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Role</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.role || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar size={16} className="text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Hire Date</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.hire_date || '—'}</p>
              </div>
            </div>
          </div>

          {/* Contact Details */}
          {hasEmployee && (
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-3">Contact Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Phone</p>
                    {editing && canEditAccountInfo ? (
                      <input value={accountInfo.phone} onChange={e => setAccountInfo({ ...accountInfo, phone: e.target.value })} className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" />
                    ) : (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.phone || '—'}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 md:col-span-2">
                  <MapPin size={16} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Address</p>
                    {editing && canEditAccountInfo ? (
                      <input value={accountInfo.address} onChange={e => setAccountInfo({ ...accountInfo, address: e.target.value })} className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" />
                    ) : (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{accountInfo.address || '—'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit/Save/Cancel buttons */}
          {editing && canEditAccountInfo && (
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button
                onClick={() => { saveAccountInfo(); setEditing(false); }}
                disabled={savingInfo}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-deep text-white rounded-xl text-sm font-bold hover:bg-teal-green transition-colors disabled:opacity-50"
              >
                <Save size={14} /> {savingInfo ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <X size={14} /> Cancel
              </button>
            </div>
          )}
        </Card>

        {/* Change Password */}
        <Card>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4">Change Password</h3>
          <form onSubmit={handleChange} className="space-y-3 max-w-sm">
            <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" minLength={6} maxLength={128} autoComplete="current-password" required />
            <input type="password" placeholder="New password" value={newPass} onChange={e => setNewPass(e.target.value)} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40" minLength={8} maxLength={128} autoComplete="new-password" required />
            <button type="submit" className="px-4 py-2.5 bg-teal-deep text-white rounded-xl text-sm font-bold hover:bg-teal-green transition-colors" disabled={loading}>{loading ? 'Saving...' : 'Change Password'}</button>
          </form>
        </Card>

        {/* Preferences */}
        <Card>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2">Preferences</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Theme toggle is available in the sidebar.</p>
        </Card>

        <Modal
          open={isAdjustPhotoModalOpen}
          title="Adjust Profile Picture"
          onClose={cancelAdjustPhoto}
          maxWidthClassName="max-w-2xl"
          bodyClassName="flex flex-col items-center"
        >
          <div className="w-full space-y-6">
            <div className="flex justify-center">
              <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg">
                {pendingPhoto ? (
                  <img
                    src={pendingPhoto}
                    alt="Adjust preview"
                    className="absolute left-1/2 top-1/2 max-w-none"
                    style={{ transform: `translate(-50%, -50%) translate(${photoOffsetX}px, ${photoOffsetY}px) scale(${photoZoom})` }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">No selected photo uploaded.</div>
                )}
              </div>
            </div>

            <div className="w-full space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Zoom: {photoZoom.toFixed(2)}x</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={photoZoom}
                  onChange={e => setPhotoZoom(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Horizontal: {photoOffsetX}px</label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={photoOffsetX}
                  onChange={e => setPhotoOffsetX(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Vertical: {photoOffsetY}px</label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={photoOffsetY}
                  onChange={e => setPhotoOffsetY(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={() => { setPhotoZoom(1); setPhotoOffsetX(0); setPhotoOffsetY(0); }}
                disabled={uploading}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={cancelAdjustPhoto}
                disabled={uploading}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyAndUploadAdjustedPhoto}
                disabled={uploading || !pendingPhoto}
                className="px-6 py-2.5 text-sm font-bold bg-teal-deep text-white rounded-xl hover:bg-teal-green transition-colors disabled:opacity-50"
              >
                {uploading ? 'Saving...' : 'Apply and Upload'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={isPhotoModalOpen}
          title="Profile Picture"
          onClose={() => setIsPhotoModalOpen(false)}
          maxWidthClassName="max-w-xl"
          bodyClassName="flex items-center justify-center"
        >
          {profilePic ? (
            <img
              src={profilePic}
              alt="Profile"
              className="max-h-[70vh] w-auto rounded-2xl object-contain border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-full py-10 text-center text-sm text-slate-500 dark:text-slate-400">No profile picture uploaded.</div>
          )}
        </Modal>

        <Modal
          open={isProfileAccountModalOpen}
          title="Profile and Account Information"
          onClose={() => setIsProfileAccountModalOpen(false)}
          maxWidthClassName="max-w-2xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
            <div className="flex flex-col items-center text-center">
              {profilePic ? (
                <img
                  src={profilePic}
                  alt="Profile"
                  className="w-36 h-36 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-36 h-36 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                  <Camera size={36} className="text-slate-400" />
                </div>
              )}
              <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">{accountInfo.employee_name || user.employee_name || user.full_name || '—'}</p>
              <p className="text-xs uppercase font-semibold text-teal-600 dark:text-teal-400">{accountInfo.dept || '—'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{accountInfo.position || '—'}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Email</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 break-all">{accountInfo.email || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Phone</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{accountInfo.phone || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Role</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{accountInfo.role || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Hire Date</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{accountInfo.hire_date || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:col-span-2">
                <p className="text-[10px] uppercase font-bold text-slate-400">Address</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{accountInfo.address || '—'}</p>
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default Settings;
