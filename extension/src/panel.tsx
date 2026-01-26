import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { twitchHelper } from './twitchHelper';
import { api, Profile, Raid } from './api';

function Panel() {
  const [authorized, setAuthorized] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [raid, setRaid] = useState<Raid | null>(null);
  const [activeTab, setActiveTab] = useState<'me' | 'public' | 'raid'>('me');
  const [searchName, setSearchName] = useState('');
  const [publicProfile, setPublicProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    twitchHelper.onAuthorized((auth) => {
      setAuthorized(true);
      loadData();
      loadRaid();
      const interval = setInterval(() => {
        loadRaid();
      }, 5000);
      return () => clearInterval(interval);
    });
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const data = await api.getMyProfile();
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    }
  };

  const loadRaid = async () => {
    try {
      const data = await api.getCurrentRaid();
      setRaid(data);
    } catch (err) {
      // Silently fail for raid updates
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    try {
      await api.joinRaid();
      await loadRaid();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to join raid');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadout = async (loadout: string) => {
    setLoading(true);
    try {
      await api.setLoadout(loadout);
      await loadRaid();
    } catch (err: any) {
      setError(err.message || 'Failed to set loadout');
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!confirm('Sell all items?')) return;
    setLoading(true);
    try {
      await api.sellAll();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to sell items');
    } finally {
      setLoading(false);
    }
  };

  const handleCashIn = async (option: string) => {
    setLoading(true);
    try {
      await api.cashIn(option);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to cash in');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    setLoading(true);
    try {
      const data = await api.getPublicProfile(searchName);
      setPublicProfile(data);
      setActiveTab('public');
    } catch (err: any) {
      setError(err.message || 'User not found');
    } finally {
      setLoading(false);
    }
  };

  if (!authorized) {
    return <div style={{ padding: '20px' }}>Authorizing...</div>;
  }

  return (
    <div style={{ padding: '10px', fontFamily: 'system-ui', fontSize: '14px' }}>
      {error && (
        <div style={{ background: '#ff4444', color: 'white', padding: '8px', marginBottom: '10px', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', borderBottom: '1px solid #ccc' }}>
        <button
          onClick={() => setActiveTab('me')}
          style={{
            padding: '8px 12px',
            border: 'none',
            background: activeTab === 'me' ? '#9146ff' : '#ccc',
            color: 'white',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
        >
          Me
        </button>
        <button
          onClick={() => setActiveTab('raid')}
          style={{
            padding: '8px 12px',
            border: 'none',
            background: activeTab === 'raid' ? '#9146ff' : '#ccc',
            color: 'white',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
        >
          Raid
        </button>
        <button
          onClick={() => setActiveTab('public')}
          style={{
            padding: '8px 12px',
            border: 'none',
            background: activeTab === 'public' ? '#9146ff' : '#ccc',
            color: 'white',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
        >
          Search
        </button>
      </div>

      {activeTab === 'me' && profile && (
        <div>
          <h2>{profile.title?.name || ''} {profile.callsign || profile.twitchName}</h2>
          <div style={{ marginBottom: '15px' }}>
            <div>Cred: {profile.credits.toLocaleString()}</div>
            <div>Raids: {profile.raidsPlayed} | Extracts: {profile.extracts} | Deaths: {profile.deaths}</div>
            <div>Extract Rate: {profile.extractRate.toFixed(1)}%</div>
            {profile.killsCredited > 0 && (
              <div>PvP: {profile.killsCredited}K / {profile.deathsAttributed}D</div>
            )}
          </div>

          <h3>Inventory ({profile.inventory.length})</h3>
          <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '15px' }}>
            {profile.inventory.length === 0 ? (
              <div>No items</div>
            ) : (
              profile.inventory.map((item) => (
                <div key={item.id} style={{ padding: '4px', borderBottom: '1px solid #eee' }}>
                  {item.itemName} x{item.quantity} ({item.tier}) - {item.sellValueCred * item.quantity} Cred
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
            <button onClick={handleSell} disabled={loading || profile.inventory.length === 0} style={{ padding: '8px', cursor: 'pointer' }}>
              Sell All
            </button>
            <button onClick={() => handleCashIn('ping')} disabled={loading || profile.credits < 250} style={{ padding: '8px', cursor: 'pointer' }}>
              Ping (250)
            </button>
            <button onClick={() => handleCashIn('shoutout')} disabled={loading || profile.credits < 1000} style={{ padding: '8px', cursor: 'pointer' }}>
              Shoutout (1k)
            </button>
          </div>

          {profile.topNemesis && (
            <div style={{ marginTop: '15px', padding: '10px', background: '#f0f0f0', borderRadius: '4px' }}>
              <div>Top Nemesis: {profile.topNemesis.name} ({profile.topNemesis.kills})</div>
              {profile.topVictim && <div>Top Victim: {profile.topVictim.name} ({profile.topVictim.kills})</div>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'raid' && raid && (
        <div>
          <h2>Current Raid</h2>
          {raid.raid ? (
            <div>
              <div>Map: {raid.raid.mapName}</div>
              <div>Time Remaining: {Math.floor(raid.raid.timeRemaining / 1000 / 60)}:{(Math.floor(raid.raid.timeRemaining / 1000) % 60).toString().padStart(2, '0')}</div>
              <div>Participants: {raid.raid.participants.length}</div>

              {raid.raid.canJoin && (
                <div style={{ marginTop: '15px' }}>
                  <button onClick={handleJoin} disabled={loading} style={{ padding: '8px', marginRight: '8px', cursor: 'pointer' }}>
                    Join Raid
                  </button>
                  {raid.raid.canChangeLoadout && (
                    <>
                      <button onClick={() => handleLoadout('PVP')} disabled={loading} style={{ padding: '8px', marginRight: '8px', cursor: 'pointer' }}>
                        PVP
                      </button>
                      <button onClick={() => handleLoadout('PVE')} disabled={loading} style={{ padding: '8px', marginRight: '8px', cursor: 'pointer' }}>
                        PVE
                      </button>
                      <button onClick={() => handleLoadout('LOOTING')} disabled={loading} style={{ padding: '8px', cursor: 'pointer' }}>
                        LOOTING
                      </button>
                    </>
                  )}
                </div>
              )}

              <div style={{ marginTop: '15px' }}>
                <h3>Participants</h3>
                {raid.raid.participants.map((p) => (
                  <div key={p.userId}>
                    {p.callsign || p.twitchName} - {p.loadout}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>No active raid</div>
          )}
        </div>
      )}

      {activeTab === 'public' && (
        <div>
          <h2>Search Player</h2>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Twitch username"
              style={{ padding: '8px', flex: 1 }}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} disabled={loading} style={{ padding: '8px', cursor: 'pointer' }}>
              Search
            </button>
          </div>

          {publicProfile && (
            <div>
              <h3>{publicProfile.title?.name || ''} {publicProfile.callsign || publicProfile.twitchName}</h3>
              <div>Cred: {publicProfile.credits.toLocaleString()}</div>
              <div>Raids: {publicProfile.raidsPlayed} | Extracts: {publicProfile.extracts} | Deaths: {publicProfile.deaths}</div>
              <div>Extract Rate: {publicProfile.extractRate.toFixed(1)}%</div>
              {publicProfile.killsCredited > 0 && (
                <div>PvP: {publicProfile.killsCredited}K / {publicProfile.deathsAttributed}D</div>
              )}
              <div style={{ marginTop: '10px' }}>
                <h4>Inventory Summary</h4>
                <div>{publicProfile.inventory.length} items</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Panel />);
}
