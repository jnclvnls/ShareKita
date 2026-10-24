/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Laptop, 
  MapPin, 
  Camera, 
  Wifi, 
  HardDrive, 
  Check, 
  Sparkles,
  Lock,
  Info
} from 'lucide-react';
import { LocalDeviceIdentity, saveDeviceIdentity } from '../utils/p2pTransfer';

interface SettingsModalProps {
  device: LocalDeviceIdentity;
  onUpdateDevice: (updated: LocalDeviceIdentity) => void;
  onClose: () => void;
}

const AVATAR_OPTIONS = ['💻', '📱', '🖥️', '👨‍🏫', '👩‍💻', '🎓', '🚀', '⚡', '🤖', '📚'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  device,
  onUpdateDevice,
  onClose,
}) => {
  const [name, setName] = useState(device.name);
  const [avatar, setAvatar] = useState(device.avatar);
  const [airGapped, setAirGapped] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: LocalDeviceIdentity = {
      ...device,
      name: name.trim() || device.name,
      avatar,
    };
    saveDeviceIdentity(updated);
    onUpdateDevice(updated);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center font-bold text-slate-950 text-xs">
              SK
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Device Settings</h3>
              <p className="text-[11px] text-slate-500">Configure your local peer profile</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Device Profile */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Device Name & Avatar
            </label>

            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-xs shrink-0">
                {avatar}
              </div>

              <div className="flex-1">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Phone or Laptop"
                  className="w-full bg-slate-100 border border-slate-200 focus:border-amber-400 focus:bg-white rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Avatar Selector */}
            <div className="flex flex-wrap gap-2 pt-1">
              {AVATAR_OPTIONS.map((av) => (
                <button
                  key={av}
                  type="button"
                  onClick={() => setAvatar(av)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border transition-all ${
                    avatar === av
                      ? 'border-amber-400 bg-amber-100/60 scale-105'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          {/* Privacy & Security */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Privacy & Zero-Cloud Security
            </label>

            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Enforce Air-Gapped Mode</h4>
                    <p className="text-[11px] text-slate-500">
                      Block internet cloud relay. Restrict all packets strictly to the local subnet.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={airGapped}
                  onChange={(e) => setAirGapped(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-200/60">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Auto-Accept from Known Lab Mates</h4>
                    <p className="text-[11px] text-slate-500">
                      Bypass manual transfer prompt for peers in the same lab room.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoAccept}
                  onChange={(e) => setAutoAccept(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* App Permissions Status (React Native style) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              System Permissions Status
            </label>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <Camera className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="font-semibold text-slate-800 block text-[11px]">Camera QR</span>
                <span className="text-[10px] text-emerald-700 font-bold">Authorized</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <Wifi className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="font-semibold text-slate-800 block text-[11px]">Local Mesh</span>
                <span className="text-[10px] text-emerald-700 font-bold">Enabled</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <HardDrive className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="font-semibold text-slate-800 block text-[11px]">Local File</span>
                <span className="text-[10px] text-emerald-700 font-bold">Storage Ready</span>
              </div>
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-300/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {savedNotice ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Settings Saved</span>
                </>
              ) : (
                <span>Save Profile Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
