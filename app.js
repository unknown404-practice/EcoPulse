const {
  useState,
  useEffect,
  useRef
} = React;
const DB = {
  get: (k, def) => {
    const v = localStorage.getItem(k);
    return v !== null ? JSON.parse(v) : def;
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};
const REGIONS = {
  uk: {
    id: 'uk',
    name: 'UK-National',
    api: 'uk',
    lat: 51.5,
    lon: -0.1,
    tz: 'Europe/London'
  },
  eu: {
    id: 'eu',
    name: 'EU-Central (GER)',
    api: 'weather',
    lat: 51.16,
    lon: 10.45,
    tz: 'Europe/Berlin'
  },
  us: {
    id: 'us',
    name: 'US-East (NY)',
    api: 'weather',
    lat: 40.71,
    lon: -74.00,
    tz: 'America/New_York'
  },
  asia: {
    id: 'asia',
    name: 'Asia-South (IN)',
    api: 'weather',
    lat: 19.07,
    lon: 72.87,
    tz: 'Asia/Kolkata'
  }
};
const firebaseConfig = {
  apiKey: "AIzaSyDPo-XDF5iCE0Rx3NIudlpdW9E1kA3m1M4",
  authDomain: "ecopulse-68cb3.firebaseapp.com",
  projectId: "ecopulse-68cb3",
  storageBucket: "ecopulse-68cb3.firebasestorage.app",
  messagingSenderId: "17305533738",
  appId: "1:17305533738:web:be6a7449eee5b1ff9df253",
  measurementId: "G-H2FMDFPMQY"
};
let auth = null;
let googleProvider = null;
try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();
  } else {
    console.warn("Firebase is blocked. Running offline mode.");
  }
} catch (e) {
  console.error(e);
}
const DashboardApp = ({
  user,
  onSignOut
}) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [region, setRegion] = useState('uk');
  const [clock, setClock] = useState('');
  const [threshold, setThreshold] = useState(DB.get('ep_threshold', 150));
  const [minWindow, setMinWindow] = useState(DB.get('ep_window', 45));
  const [isHalted, setIsHalted] = useState(DB.get('ep_halted', false));
  const [accent, setAccent] = useState(DB.get('ep_accent', '#D97757'));
  const [theme, setTheme] = useState(DB.get('ep_theme', 'dark'));
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    DB.set('ep_theme', theme);
  }, [theme]);
  const [profileName, setProfileName] = useState(user?.displayName || 'Developer');
  const [userName, setUserName] = useState(user?.email || 'admin');
  const [profilePic, setProfilePic] = useState(user?.photoURL || '');
  const [intensity, setIntensity] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [logs, setLogs] = useState([{
    ts: new Date().toLocaleTimeString(),
    msg: "SYSTEM: Initializing Database & Regions...",
    type: "info"
  }]);
  const [activeWorkloads, setActiveWorkloads] = useState(1208);
  const [statusIndex, setStatusIndex] = useState('pending');
  const addLog = (msg, type = "info") => {
    setLogs(prev => [...prev.slice(-14), {
      ts: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      msg,
      type
    }]);
  };
  useEffect(() => {
    const handleToggle = () => {
      const el = document.getElementById('simPopup');
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    };
    window.addEventListener('toggleSimPopup', handleToggle);
    const int = setInterval(() => {
      const timeOpts = {
        timeZone: REGIONS[region].tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      setClock(new Date().toLocaleTimeString('en-US', timeOpts));
    }, 1000);
    return () => {
      clearInterval(int);
      window.removeEventListener('toggleSimPopup', handleToggle);
    };
  }, [region]);
  const fetchRegionData = async (forceFallback = false) => {
    if (isHalted) return;
    const reg = REGIONS[region];
    try {
      addLog(`API: Polling data for ${reg.name}...`, "info");
      if (reg.api === 'uk' && !forceFallback) {
        const resCurrent = await fetch("https://api.carbonintensity.org.uk/intensity");
        const dataCur = await resCurrent.json();
        const current = dataCur.data[0].intensity;
        const val = current.actual || current.forecast;
        setIntensity(val);
        setStatusIndex(val <= threshold ? 'low' : 'high');
        addLog(`API: Received UK-NATIONAL (${val}g)`, "success");
        const dateStr = new Date().toISOString().split('T')[0];
        const resFore = await fetch(`https://api.carbonintensity.org.uk/intensity/date/${dateStr}`);
        const dataFore = await resFore.json();
        setForecast(dataFore.data.map(d => d.intensity.forecast));
      } else {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${reg.lat}&longitude=${reg.lon}&current=wind_speed_10m,shortwave_radiation&hourly=wind_speed_10m,shortwave_radiation`);
        const data = await res.json();
        const wind = data.current.wind_speed_10m;
        const solar = data.current.shortwave_radiation;
        const calcCO2 = (w, s) => Math.max(50, Math.min(500, Math.floor(400 - w * 8 - s * 0.3)));
        const val = calcCO2(wind, solar);
        setIntensity(val);
        setStatusIndex(val <= threshold ? 'low' : 'high');
        addLog(`API: Open-Meteo generated (${val}g) from live weather.`, "success");
        const hourly = [];
        for (let i = 0; i < 24; i++) hourly.push(calcCO2(data.hourly.wind_speed_10m[i], data.hourly.shortwave_radiation[i]));
        setForecast(hourly);
      }
    } catch (e) {
      addLog(`API: Failed to fetch data for ${reg.name}`, "err");
    }
  };
  useEffect(() => {
    if (isHalted) {
      setActiveWorkloads(0);
      setStatusIndex('halted');
      return;
    }
    if (intensity === null) return;
    if (intensity <= threshold) {
      setActiveWorkloads(1690);
      addLog(`ENGINE: Intensity (${intensity}g) <= Threshold (${threshold}g). Grid is GREEN. Resuming tasks...`, "success");
    } else {
      setActiveWorkloads(740);
      addLog(`ENGINE: Intensity (${intensity}g) > Threshold (${threshold}g). Grid is RED. Pausing heavy tasks...`, "warn");
    }
  }, [intensity, threshold, isHalted]);
  useEffect(() => {
    fetchRegionData();
    const intId = setInterval(() => fetchRegionData(), 60000);
    return () => clearInterval(intId);
  }, [region, isHalted]);
  const triggerFallback = () => fetchRegionData(true);
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  return /*#__PURE__*/React.createElement("div", {
    className: "app-shell"
  }, /*#__PURE__*/React.createElement(Sidebar, {
    activeTab: activeTab,
    setTab: setActiveTab,
    region: region,
    setRegion: setRegion,
    clock: clock,
    theme: theme,
    toggleTheme: toggleTheme,
    profileName: profileName,
    userName: userName,
    profilePic: profilePic
  }), /*#__PURE__*/React.createElement("main", {
    className: "main-canvas"
  }, activeTab === 'dashboard' && /*#__PURE__*/React.createElement(Dashboard, {
    intensity: intensity,
    forecast: forecast,
    logs: logs,
    activeWorkloads: activeWorkloads,
    statusIndex: statusIndex,
    triggerFallback: triggerFallback,
    isHalted: isHalted
  }), activeTab === 'architecture' && /*#__PURE__*/React.createElement(ArchitectureView, null), activeTab === 'historical' && /*#__PURE__*/React.createElement(HistoricalView, {
    region: region,
    threshold: threshold
  }), activeTab === 'integrations' && /*#__PURE__*/React.createElement(Integrations, {
    region: region,
    threshold: threshold
  }), activeTab === 'profile' && /*#__PURE__*/React.createElement(ProfileView, {
    profileName: profileName,
    setProfileName: setProfileName,
    userName: userName,
    setUserName: setUserName,
    profilePic: profilePic,
    setProfilePic: setProfilePic,
    onSignOut: onSignOut,
    setTab: setActiveTab
  }), activeTab === 'documentation' && /*#__PURE__*/React.createElement(DocumentationView, {
    setTab: setActiveTab
  }), activeTab === 'settings' && /*#__PURE__*/React.createElement(Settings, {
    threshold: threshold,
    setThreshold: t => {
      setThreshold(t);
      DB.set('ep_threshold', t);
    },
    minWindow: minWindow,
    setMinWindow: w => {
      setMinWindow(w);
      DB.set('ep_window', w);
    },
    isHalted: isHalted,
    setIsHalted: h => {
      setIsHalted(h);
      DB.set('ep_halted', h);
      addLog(`SYSTEM: Engine Halted = ${h}`, h ? 'err' : 'info');
    }
  }), /*#__PURE__*/React.createElement("footer", {
    style: {
      marginTop: 'auto',
      paddingTop: '64px',
      paddingBottom: '16px',
      textAlign: 'center',
      color: 'var(--muted)',
      fontSize: '13px',
      fontFamily: 'var(--font-body)'
    }
  }, "\xA9 ", new Date().getFullYear(), " EcoPulse. All rights reserved."), /*#__PURE__*/React.createElement("div", {
    id: "simPopup",
    style: {
      display: 'none',
      position: 'fixed',
      top: '80px',
      right: '16px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      padding: '20px',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-float)',
      zIndex: 1001,
      minWidth: '280px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      fontWeight: '800',
      textTransform: 'uppercase',
      color: 'var(--muted)',
      letterSpacing: '0.05em'
    }
  }, "Simulation Engine"), /*#__PURE__*/React.createElement("button", {
    onClick: () => document.getElementById('simPopup').style.display = 'none',
    style: {
      background: 'transparent',
      border: 'none',
      color: 'var(--muted)',
      cursor: 'pointer'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      marginBottom: '8px',
      color: 'var(--muted)'
    }
  }, "Monitoring Region"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px'
    }
  }, ['uk', 'eu', 'us', 'asia'].map(r => /*#__PURE__*/React.createElement("button", {
    key: r,
    onClick: () => {
      setRegion(r);
      document.getElementById('simPopup').style.display = 'none';
    },
    className: region === r ? 'btn-primary' : '',
    style: {
      padding: '8px',
      fontSize: '12px',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      border: region === r ? 'none' : '1px solid var(--border)',
      background: region === r ? '' : 'transparent',
      color: region === r ? '' : 'var(--fg)',
      fontWeight: '600',
      display: 'flex',
      justifyContent: 'center'
    }
  }, r === 'uk' ? 'UK (LIVE)' : r.toUpperCase())))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      marginBottom: '8px',
      color: 'var(--muted)'
    }
  }, "Global Sync Time"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px',
      background: 'var(--bg)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      fontFamily: 'var(--font-mono)'
    }
  }, clock || '--:--:--'), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: 'var(--success)',
      boxShadow: '0 0 8px var(--success)'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: '80px',
      right: '24px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '16px'
    }
  }, showSettings && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      padding: '16px',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-float)',
      width: '220px',
      animation: 'fadeIn 0.2s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      fontWeight: '800',
      textTransform: 'uppercase',
      color: 'var(--muted)',
      marginBottom: '12px'
    }
  }, "System Controls"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px'
    }
  }, "Accent"), /*#__PURE__*/React.createElement("input", {
    type: "color",
    defaultValue: theme === 'dark' ? '#D97757' : '#D97757',
    onChange: e => document.documentElement.style.setProperty('--accent', e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px'
    }
  }, "Radii"), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "0",
    max: "30",
    defaultValue: "16",
    onChange: e => document.documentElement.style.setProperty('--radius-lg', e.target.value + 'px')
  })))), /*#__PURE__*/React.createElement("div", {
    onClick: () => setShowSettings(!showSettings),
    style: {
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      background: 'conic-gradient(from 0deg, #ff5f56, #ffbd2e, #27c93f, #007bff, #ff5f56)',
      display: 'grid',
      placeItems: 'center',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      transition: 'transform 0.2s ease',
      transform: showSettings ? 'rotate(45deg)' : 'rotate(0deg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: 'var(--surface)',
      display: 'grid',
      placeItems: 'center',
      color: 'var(--fg)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
  })))))));
};
const Sidebar = ({
  activeTab,
  setTab,
  region,
  setRegion,
  clock,
  theme,
  toggleTheme,
  profileName,
  userName,
  profilePic
}) => /*#__PURE__*/React.createElement("aside", {
  className: "sidebar"
}, /*#__PURE__*/React.createElement("div", {
  className: "top-bar",
  style: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "brand",
  onClick: () => setTab('documentation'),
  style: {
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: '0',
    flexShrink: 0
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "brand-icon",
  style: {
    background: 'transparent',
    boxShadow: 'none',
    width: '32px',
    height: '32px'
  }
}, /*#__PURE__*/React.createElement("img", {
  src: "library.png",
  alt: "EcoPulse",
  style: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: theme === 'dark' ? 'invert(1)' : 'none'
  }
})), /*#__PURE__*/React.createElement("h1", {
  className: "brand-title",
  style: {
    fontSize: '28px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    color: 'var(--fg)',
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1
  }
}, "EcoPulse")), /*#__PURE__*/React.createElement("div", {
  className: "brand-subtitle",
  style: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    marginTop: '2px'
  }
}, "Production Engine")), /*#__PURE__*/React.createElement("div", {
  className: "desktop-theme-toggle theme-toggle",
  onClick: toggleTheme,
  style: {
    background: 'var(--bg)',
    borderRadius: '50%',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    color: 'var(--muted)',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }
}, /*#__PURE__*/React.createElement("svg", {
  width: "18",
  height: "18",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}, /*#__PURE__*/React.createElement("path", {
  d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
}))), /*#__PURE__*/React.createElement("div", {
  className: "mobile-controls",
  style: {
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "mobile-region-pill",
  onClick: () => window.dispatchEvent(new CustomEvent('toggleSimPopup')),
  style: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--bg)',
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--muted)',
    whiteSpace: 'nowrap'
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--success)',
    boxShadow: '0 0 6px var(--success)'
  }
}), region.toUpperCase(), " \u2022 ", clock || '--:--'), /*#__PURE__*/React.createElement("div", {
  className: "theme-toggle mobile-theme-btn",
  onClick: toggleTheme,
  style: {
    flexShrink: 0
  }
}, /*#__PURE__*/React.createElement("svg", {
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}, /*#__PURE__*/React.createElement("path", {
  d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
}))), /*#__PURE__*/React.createElement("div", {
  className: "mobile-profile-btn",
  onClick: () => setTab('profile'),
  style: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontWeight: '600',
    flexShrink: 0
  }
}, profilePic ? /*#__PURE__*/React.createElement("img", {
  src: profilePic,
  style: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover'
  }
}) : profileName.charAt(0).toUpperCase()))), /*#__PURE__*/React.createElement("nav", {
  className: "nav-menu"
}, /*#__PURE__*/React.createElement("button", {
  className: `nav-link ${activeTab === 'dashboard' ? 'active' : ''}`,
  onClick: () => setTab('dashboard')
}, "Dashboard"), /*#__PURE__*/React.createElement("button", {
  className: `nav-link ${activeTab === 'architecture' ? 'active' : ''}`,
  onClick: () => setTab('architecture')
}, "Architecture"), /*#__PURE__*/React.createElement("button", {
  className: `nav-link ${activeTab === 'historical' ? 'active' : ''}`,
  onClick: () => setTab('historical')
}, "Historical Preview"), /*#__PURE__*/React.createElement("button", {
  className: `nav-link ${activeTab === 'settings' ? 'active' : ''}`,
  onClick: () => setTab('settings')
}, "Settings")), /*#__PURE__*/React.createElement("div", {
  className: "desktop-controls"
}, /*#__PURE__*/React.createElement("div", {
  onClick: () => window.dispatchEvent(new CustomEvent('toggleSimPopup')),
  style: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--bg)',
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--muted)',
    whiteSpace: 'nowrap',
    justifyContent: 'center'
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--success)',
    boxShadow: '0 0 8px var(--success)'
  }
}), region.toUpperCase(), " \u2022 ", clock || '--:--'), /*#__PURE__*/React.createElement("div", {
  onClick: () => setTab('profile'),
  style: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: 'var(--bg)',
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    color: 'var(--fg)',
    transition: 'all 0.2s'
  },
  onMouseOver: e => e.currentTarget.style.borderColor = 'var(--accent)',
  onMouseOut: e => e.currentTarget.style.borderColor = 'var(--border)'
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '15px',
    flexShrink: 0
  }
}, profilePic ? /*#__PURE__*/React.createElement("img", {
  src: profilePic,
  style: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover'
  }
}) : profileName.charAt(0).toUpperCase()), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    flexDirection: 'column'
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: '13px',
    fontWeight: '600'
  }
}, profileName), /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: '11px',
    color: 'var(--muted)'
  }
}, "Manage Profile")))));
const Dashboard = ({
  intensity,
  forecast,
  logs,
  activeWorkloads,
  statusIndex,
  triggerFallback,
  isHalted,
  setTab
}) => {
  const [hoverIdx, setHoverIdx] = React.useState(null);
  return /*#__PURE__*/React.createElement("div", {
    className: "view-enter"
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      marginBottom: '40px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '36px',
      marginBottom: '8px'
    }
  }, "Dashboard Overview"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--muted)',
      fontSize: '18px'
    }
  }, "Real-time telemetry and task orchestration overview.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: triggerFallback,
    disabled: isHalted
  }, "Force Weather Fallback"))), /*#__PURE__*/React.createElement("div", {
    className: "stats-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Grid Intensity"), /*#__PURE__*/React.createElement("span", {
    className: `indicator ${statusIndex}`
  })), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, intensity !== null ? intensity : '--', " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      color: 'var(--muted)'
    }
  }, "gCO\u2082/kWh")), /*#__PURE__*/React.createElement("div", {
    className: "stat-meta trend-down"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "23 18 13.5 8.5 8.5 13.5 1 6"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "17 18 23 18 23 12"
  })), "12.4% below regional baseline")), /*#__PURE__*/React.createElement("div", {
    className: "card stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Carbon Prevented")), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, "842.2 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      color: 'var(--muted)'
    }
  }, "kg")), /*#__PURE__*/React.createElement("div", {
    className: "stat-meta",
    style: {
      color: 'var(--success)'
    }
  }, "Equivalent to planting 14 trees today")), /*#__PURE__*/React.createElement("div", {
    className: "card stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Active Workloads")), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, activeWorkloads.toLocaleString()), /*#__PURE__*/React.createElement("div", {
    className: "stat-meta"
  }, "482 deferred to Green Window"), /*#__PURE__*/React.createElement("div", {
    className: "card stat-card",
    style: {
      cursor: 'pointer',
      transition: 'transform 0.2s',
      position: 'relative',
      overflow: 'hidden'
    },
    onClick: () => setTab('historical'),
    onMouseOver: e => e.currentTarget.style.transform = 'translateY(-2px)',
    onMouseOut: e => e.currentTarget.style.transform = 'none'
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Historical Preview")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      height: '40px',
      gap: '4px',
      marginTop: '12px',
      zIndex: 1,
      position: 'relative'
    }
  }, [40, 60, 100, 30, 80, 50, 70].map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: h + '%',
      background: 'var(--accent)',
      borderRadius: '2px',
      opacity: 0.8
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "stat-meta",
    style: {
      marginTop: '12px',
      zIndex: 1,
      position: 'relative'
    }
  }, "View 7-day carbon prevention"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg, transparent 50%, color-mix(in oklch, var(--accent) 10%, transparent))',
      zIndex: 0
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title"
  }, "Predictive Emission Curve"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '300px',
      marginTop: '32px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 800 200",
    style: {
      width: '100%',
      height: '100%',
      overflow: 'visible'
    },
    onMouseLeave: () => setHoverIdx(null)
  }, (() => {
    const maxH = 160;
    const yBase = 180;
    const maxV = 500;
    const getPts = () => {
      if (forecast && forecast.length >= 24) {
        // Pick 5 points from forecast (e.g. 0, 6, 12, 18, 23)
        // For UK (48 points), we use 0, 12, 24, 36, 47
        const step = Math.floor(forecast.length / 4);
        return [{
          x: 0,
          time: "00:00",
          val: forecast[0]
        }, {
          x: 200,
          time: "06:00",
          val: forecast[step]
        }, {
          x: 400,
          time: "12:00",
          val: forecast[step * 2]
        }, {
          x: 600,
          time: "18:00",
          val: forecast[step * 3]
        }, {
          x: 800,
          time: "23:00",
          val: forecast[forecast.length - 1]
        }].map(p => ({
          ...p,
          y: yBase - p.val / maxV * maxH
        }));
      }
      // Default fallback
      return [{
        x: 0,
        y: 150,
        time: "08:00",
        val: 320
      }, {
        x: 200,
        y: 120,
        time: "12:00",
        val: 260
      }, {
        x: 400,
        y: 100,
        time: "16:00",
        val: 140
      }, {
        x: 600,
        y: 180,
        time: "20:00",
        val: 380
      }, {
        x: 800,
        y: 80,
        time: "00:00",
        val: 110
      }];
    };
    const pts = getPts();

    // Smooth curve path
    const pathD = `M${pts[0].x},${pts[0].y} 
                                        C100,${pts[0].y} 100,${pts[1].y} ${pts[1].x},${pts[1].y} 
                                        C300,${pts[1].y} 300,${pts[2].y} ${pts[2].x},${pts[2].y}
                                        C500,${pts[2].y} 500,${pts[3].y} ${pts[3].x},${pts[3].y}
                                        C700,${pts[3].y} 700,${pts[4].y} ${pts[4].x},${pts[4].y}`;
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: pathD,
      fill: "none",
      stroke: "var(--accent)",
      strokeWidth: "3"
    }), pts.map((pt, i) => /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("circle", {
      cx: pt.x,
      cy: pt.y,
      r: hoverIdx === i ? "8" : "5",
      fill: hoverIdx === i ? "var(--fg)" : "var(--accent)",
      stroke: "var(--surface)",
      strokeWidth: "2",
      onMouseEnter: () => setHoverIdx(i),
      style: {
        cursor: 'pointer',
        transition: 'all 0.2s'
      }
    }), hoverIdx === i && /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: pt.x - 50,
      y: pt.y - 50,
      width: "100",
      height: "40",
      rx: "8",
      fill: "var(--surface)",
      stroke: "var(--border)"
    }), /*#__PURE__*/React.createElement("text", {
      x: pt.x,
      y: pt.y - 35,
      fontSize: "12",
      fontWeight: "600",
      fill: "var(--fg)",
      textAnchor: "middle"
    }, pt.val, " gCO\u2082/kWh"), /*#__PURE__*/React.createElement("text", {
      x: pt.x,
      y: pt.y - 20,
      fontSize: "10",
      fill: "var(--muted)",
      textAnchor: "middle"
    }, pt.time)))), /*#__PURE__*/React.createElement("line", {
      x1: "0",
      y1: "180",
      x2: "800",
      y2: "180",
      stroke: "var(--border)",
      strokeDasharray: "4 4"
    }), pts.map((pt, i) => /*#__PURE__*/React.createElement("text", {
      key: `label-${i}`,
      x: pt.x > 750 ? pt.x - 20 : pt.x,
      y: "195",
      fontSize: "11",
      fill: "var(--muted)"
    }, pt.time)));
  })()))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title"
  }, "Impact Metrics"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px',
      background: 'var(--bg)',
      borderRadius: 'var(--radius-md)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '24px',
      fontWeight: '700',
      fontFamily: 'var(--font-display)'
    }
  }, "1.2k"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      fontWeight: '700',
      color: 'var(--muted)',
      textTransform: 'uppercase'
    }
  }, "Miles Saved")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px',
      background: 'var(--bg)',
      borderRadius: 'var(--radius-md)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '24px',
      fontWeight: '700',
      fontFamily: 'var(--font-display)'
    }
  }, "4.8"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      fontWeight: '700',
      color: 'var(--muted)',
      textTransform: 'uppercase'
    }
  }, "Homes Powered")))), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title"
  }, "Live Event Stream"), /*#__PURE__*/React.createElement("div", {
    className: "terminal"
  }, logs.map((log, i) => /*#__PURE__*/React.createElement("div", {
    className: "log-entry",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "log-ts"
  }, "[", log.ts, "]"), /*#__PURE__*/React.createElement("span", {
    className: `log-msg ${log.type}`
  }, log.msg))), logs.length === 0 && /*#__PURE__*/React.createElement("div", null, "No logs found."))))));
};
const ArchitectureView = () => {
  const [activeNode, setActiveNode] = useState('scheduler');
  const nodeDetails = {
    scheduler: {
      title: "Cloud Scheduler (Cron)",
      desc: "Serverless cron job that triggers the ingestion engine every 30-60 minutes.",
      code: `resource "google_cloud_scheduler_job" "pulse_trigger" {
  name     = "ecopulse-telemetry-trigger"
  schedule = "*/30 * * * *" # Every 30m
  http_target {
    uri = google_cloudfunctions_function.ingest.https_trigger_url
  }
}`
    },
    ingestion: {
      title: "Ingestion Engine",
      desc: "Cloud Function that fetches real-time telemetry from WattTime or Electricity Maps.",
      code: `async function fetchIntensity(region) {
  const resp = await axios.get(WATT_TIME_API, {
    params: { ba: region },
    headers: { Authorization: \`Bearer \${TOKEN}\` }
  });
  return resp.data.carbon_intensity;
}`
    },
    pubsub: {
      title: "Pub/Sub Broadcaster",
      desc: "Decouples the logic engine from client delivery, allowing for massive regional scale.",
      code: `// Publish 'GREEN' signal to region topic
const data = Buffer.from(JSON.stringify({
  status: 'GREEN',
  threshold: 150
}));
await pubsub.topic('region_us_east').publish(data);`
    },
    fcm: {
      title: "Firebase Cloud Messaging",
      desc: "Delivers silent data payloads to client devices to wake up background workers.",
      code: `{
  "message": {
    "topic": "region_us_east",
    "data": {
      "command": "SHIFT_EXECUTE",
      "window_end": "2026-06-12T16:00:00Z"
    }
  }
}`
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "view-enter"
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      marginBottom: '40px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '36px',
      marginBottom: '8px'
    }
  }, "Architecture View"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--muted)',
      fontSize: '18px'
    }
  }, "Serverless orchestration topology for carbon-aware execution.")), /*#__PURE__*/React.createElement("div", {
    className: "card arch-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '48px',
      padding: '40px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("svg", {
    className: "arch-svg",
    viewBox: "0 0 400 450",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("marker", {
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "4",
    markerHeight: "4",
    orient: "auto-start-reverse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 0 0 L 10 5 L 0 10 z",
    fill: "var(--border)"
  })), /*#__PURE__*/React.createElement("marker", {
    id: "arrow-active",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "4",
    markerHeight: "4",
    orient: "auto-start-reverse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 0 0 L 10 5 L 0 10 z",
    fill: "var(--accent)"
  }))), /*#__PURE__*/React.createElement("path", {
    d: "M 200 60 L 200 100",
    className: `connection-line ${['scheduler', 'ingestion'].includes(activeNode) ? 'active' : ''}`,
    "marker-end": "url(#arrow)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 200 160 L 200 200",
    className: `connection-line ${['ingestion', 'pubsub'].includes(activeNode) ? 'active' : ''}`,
    "marker-end": "url(#arrow)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 200 260 L 200 300",
    className: `connection-line ${['pubsub', 'fcm'].includes(activeNode) ? 'active' : ''}`,
    "marker-end": "url(#arrow)"
  }), /*#__PURE__*/React.createElement("g", {
    className: `arch-node ${activeNode === 'scheduler' ? 'active' : ''}`,
    onClick: () => setActiveNode('scheduler')
  }, /*#__PURE__*/React.createElement("rect", {
    x: "125",
    y: "10",
    width: "150",
    height: "50",
    rx: "8"
  }), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "32",
    "text-anchor": "middle",
    fontWeight: "600",
    fontSize: "12"
  }, "Cloud Scheduler"), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "46",
    "text-anchor": "middle",
    className: "node-type"
  }, "Cron Trigger")), /*#__PURE__*/React.createElement("g", {
    className: `arch-node ${activeNode === 'ingestion' ? 'active' : ''}`,
    onClick: () => setActiveNode('ingestion')
  }, /*#__PURE__*/React.createElement("rect", {
    x: "125",
    y: "110",
    width: "150",
    height: "50",
    rx: "8"
  }), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "132",
    "text-anchor": "middle",
    fontWeight: "600",
    fontSize: "12"
  }, "Ingestion Engine"), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "146",
    "text-anchor": "middle",
    className: "node-type"
  }, "API Fetcher")), /*#__PURE__*/React.createElement("g", {
    className: `arch-node ${activeNode === 'pubsub' ? 'active' : ''}`,
    onClick: () => setActiveNode('pubsub')
  }, /*#__PURE__*/React.createElement("rect", {
    x: "125",
    y: "210",
    width: "150",
    height: "50",
    rx: "8"
  }), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "232",
    "text-anchor": "middle",
    fontWeight: "600",
    fontSize: "12"
  }, "Pub/Sub Engine"), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "246",
    "text-anchor": "middle",
    className: "node-type"
  }, "Event Broadcaster")), /*#__PURE__*/React.createElement("g", {
    className: `arch-node ${activeNode === 'fcm' ? 'active' : ''}`,
    onClick: () => setActiveNode('fcm')
  }, /*#__PURE__*/React.createElement("rect", {
    x: "125",
    y: "310",
    width: "150",
    height: "50",
    rx: "8"
  }), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "332",
    "text-anchor": "middle",
    fontWeight: "600",
    fontSize: "12"
  }, "Firebase / Client"), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "346",
    "text-anchor": "middle",
    className: "node-type"
  }, "Push Delivery")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: '28px',
      marginBottom: '8px'
    }
  }, nodeDetails[activeNode].title), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--muted)'
    }
  }, nodeDetails[activeNode].desc)), /*#__PURE__*/React.createElement("div", {
    className: "code-window"
  }, /*#__PURE__*/React.createElement("div", {
    className: "code-header"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: '#ff5f56'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: '#ffbd2e'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: '#27c93f'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: '700',
      color: '#666'
    }
  }, "SOURCE PREVIEW")), /*#__PURE__*/React.createElement("div", {
    className: "code-body"
  }, /*#__PURE__*/React.createElement("pre", {
    style: {
      whiteSpace: 'pre-wrap'
    }
  }, nodeDetails[activeNode].code))))));
};
const Integrations = () => /*#__PURE__*/React.createElement("div", {
  className: "view-enter"
}, /*#__PURE__*/React.createElement("header", {
  style: {
    marginBottom: '40px'
  }
}, /*#__PURE__*/React.createElement("h2", {
  style: {
    fontSize: '36px',
    marginBottom: '8px'
  }
}, "Integrations & SDK"), /*#__PURE__*/React.createElement("p", {
  style: {
    color: 'var(--muted)',
    fontSize: '18px'
  }
}, "Integrate carbon-aware computing into any codebase via APIs or SDKs.")), /*#__PURE__*/React.createElement("div", {
  className: "dashboard-grid"
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "card"
}, /*#__PURE__*/React.createElement("h3", {
  className: "card-title"
}, "Node.js SDK Initialization"), /*#__PURE__*/React.createElement("div", {
  className: "code-window"
}, /*#__PURE__*/React.createElement("div", {
  className: "code-header"
}, /*#__PURE__*/React.createElement("span", null, "main.ts"), /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: '10px',
    color: '#666'
  }
}, "Typescript")), /*#__PURE__*/React.createElement("div", {
  className: "code-body"
}, /*#__PURE__*/React.createElement("pre", null, `const { EcoPulse } = require('@ecopulse/sdk');

const pulse = new EcoPulse({
  apiKey: 'ep_live_942_a938',
  region: 'us-east-pjm'
});`)))), /*#__PURE__*/React.createElement("div", {
  className: "card"
}, /*#__PURE__*/React.createElement("h3", {
  className: "card-title"
}, "Usage Patterns"), /*#__PURE__*/React.createElement("div", {
  className: "code-window"
}, /*#__PURE__*/React.createElement("div", {
  className: "code-header"
}, /*#__PURE__*/React.createElement("span", null, "tasks.ts"), /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: '10px',
    color: '#666'
  }
}, "Typescript")), /*#__PURE__*/React.createElement("div", {
  className: "code-body"
}, /*#__PURE__*/React.createElement("pre", null, `// Wrap heavy tasks in a scheduler queue
await pulse.schedule(async () => {
  await database.runHeavyMigration();
}, {
  priority: 'low',
  maxDelay: '12h'
});`))))), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "card"
}, /*#__PURE__*/React.createElement("h3", {
  className: "card-title"
}, "Active API Keys"), /*#__PURE__*/React.createElement("div", {
  style: {
    padding: '16px',
    background: 'var(--bg)',
    border: '1px dashed var(--border)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    wordBreak: 'break-all',
    marginBottom: '16px'
  }
}, "ep_live_942_a938_b102_c942"), /*#__PURE__*/React.createElement("button", {
  className: "btn btn-outline",
  style: {
    width: '100%',
    justifyContent: 'center'
  }
}, "Regenerate Key")), /*#__PURE__*/React.createElement("div", {
  className: "card"
}, /*#__PURE__*/React.createElement("h3", {
  className: "card-title"
}, "Registered Webhooks"), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)'
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    color: 'var(--muted)'
  }
}, "Slack Alerts"), /*#__PURE__*/React.createElement("span", {
  style: {
    fontWeight: '500'
  }
}, "Enabled")), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)'
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    color: 'var(--muted)'
  }
}, "Datadog Logs"), /*#__PURE__*/React.createElement("span", {
  style: {
    fontWeight: '500'
  }
}, "Enabled")), /*#__PURE__*/React.createElement("button", {
  className: "btn",
  style: {
    marginTop: '8px',
    background: 'var(--bg)',
    color: 'var(--fg)',
    fontSize: '13px',
    justifyContent: 'center'
  }
}, "+ Add Webhook"))))));
const Settings = ({
  isHalted,
  setIsHalted,
  threshold,
  setThreshold,
  minWindow,
  setMinWindow
}) => {
  const [localThreshold, setLocalThreshold] = React.useState(threshold);
  const [localMinWindow, setLocalMinWindow] = React.useState(minWindow);
  const [saved, setSaved] = React.useState(false);
  const handleSave = () => {
    setThreshold(Number(localThreshold));
    setMinWindow(Number(localMinWindow));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "view-enter"
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      marginBottom: '40px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '36px',
      marginBottom: '8px'
    }
  }, "Settings"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--muted)',
      fontSize: '18px'
    }
  }, "Manage engine configurations, limits, and simulation defaults.")), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-grid"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title"
  }, "Engine Defaults"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '14px',
      color: 'var(--muted)',
      marginBottom: '20px',
      lineHeight: '1.6'
    }
  }, "Configure the thresholds that dictate when a \"Green Window\" is successfully triggered."), /*#__PURE__*/React.createElement("div", {
    className: "input-group",
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "input-label"
  }, "Threshold Intensity (gCO\u2082/kWh)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "input-field",
    value: localThreshold,
    onChange: e => setLocalThreshold(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "input-group",
    style: {
      marginBottom: '32px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "input-label"
  }, "Minimum Window Duration (Mins)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "input-field",
    value: localMinWindow,
    onChange: e => setLocalMinWindow(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px',
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: handleSave,
    style: {
      flex: 1,
      justifyContent: 'center'
    }
  }, saved ? 'Successfully Saved to Database!' : 'Save Changes')))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      border: '1px solid oklch(65% 0.15 25 / 0.3)',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title",
    style: {
      color: 'var(--danger)'
    }
  }, "System Control"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: 'var(--muted)',
      marginBottom: '16px'
    }
  }, "Permanently halt the orchestration engine to stop shifting workloads entirely."), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setIsHalted(!isHalted),
    style: {
      width: '100%',
      background: isHalted ? 'var(--bg)' : 'var(--danger)',
      color: isHalted ? 'var(--fg)' : '#fff',
      border: '1px solid var(--danger)',
      justifyContent: 'center',
      marginTop: 'auto'
    }
  }, isHalted ? 'RESUME SYSTEM' : 'STOP THE SYSTEM')))));
};
const HistoricalView = ({
  region,
  threshold
}) => {
  // Generate deterministic dummy data based on region and threshold
  const seed = region.charCodeAt(0) + threshold;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Generate last 7 days ending yesterday
  const todayIdx = new Date().getDay();
  const last7Days = [];
  for (let i = 7; i >= 1; i--) {
    const dIdx = (todayIdx - i + 7) % 7;
    last7Days.push(days[dIdx === 0 ? 6 : dIdx - 1]); // JS getDay() is 0=Sunday
  }
  const descriptions = ['Workload shifted during evening peak fossil fuel usage.', 'Heavy compute paused due to low wind generation.', 'Optimal solar generation utilized for AI training.', 'Minor adjustments made during grid fluctuations.', 'Weekend preparation tasks shifted to green windows.', 'Standard weekend background processing.', 'High wind generation allowed massive compute bursts.', 'Cloud workloads dynamically routed to cooler regions.', 'Data sync paused during unexpected grid strain.', 'Successfully bypassed peak hour emissions.'];
  const historicalData = last7Days.map((day, i) => {
    const pseudoRandom = Math.sin(seed + i) * 10000;
    const r = pseudoRandom - Math.floor(pseudoRandom);

    // Base value based on threshold (lower threshold = more paused = more saved)
    const baseVal = (100 - threshold) * 10;
    // Add randomness
    const val = Math.floor(baseVal + r * 300);
    const descIdx = Math.floor(r * descriptions.length);
    return {
      day,
      val,
      desc: descriptions[descIdx],
      h: 0 // Will calculate relative to max later
    };
  });
  const maxVal = Math.max(...historicalData.map(d => d.val));
  historicalData.forEach(d => {
    d.h = Math.max(10, Math.floor(d.val / maxVal * 100));
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "view-enter"
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      marginBottom: '40px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '36px',
      marginBottom: '8px'
    }
  }, "Historical Preview"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--muted)',
      fontSize: '18px'
    }
  }, "7-Day aggregate carbon prevention telemetry for ", region.toUpperCase(), ".")), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 'clamp(16px, 5vw, 32px)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title",
    style: {
      marginBottom: '32px'
    }
  }, "Carbon Prevented Day by Day"), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'visible',
      paddingBottom: '20px',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      height: '250px',
      gap: '2%',
      width: '100%'
    }
  }, historicalData.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      height: '100%',
      justifyContent: 'flex-end',
      minWidth: '0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'clamp(8px, 2vw, 12px)',
      color: 'var(--fg)',
      fontWeight: '700',
      padding: '2px 4px',
      background: 'var(--surface)',
      borderRadius: '4px',
      border: '1px solid var(--border)',
      whiteSpace: 'nowrap'
    }
  }, b.val, " kg"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: '40px',
      height: b.h + '%',
      minHeight: '20px',
      background: 'var(--accent)',
      borderRadius: '6px 6px 0 0',
      opacity: i === 6 ? 1 : 0.6,
      transition: 'all 0.3s ease',
      cursor: 'pointer'
    },
    onMouseOver: e => e.target.style.opacity = '1',
    onMouseOut: e => e.target.style.opacity = i === 6 ? '1' : '0.6'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'clamp(10px, 3vw, 13px)',
      fontWeight: '600',
      color: 'var(--muted)'
    }
  }, b.day.substring(0, 3)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '40px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "card-title",
    style: {
      marginBottom: '16px'
    }
  }, "Day-wise Detailed History"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }
  }, historicalData.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '16px',
      background: 'var(--bg)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      flexWrap: 'wrap',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      flex: '1 1 200px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: '600'
    }
  }, b.day), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: 'var(--muted)'
    }
  }, b.desc)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: 'var(--accent)',
      whiteSpace: 'nowrap'
    }
  }, b.val, " kg CO\u2082")))))));
};
const DocumentationView = ({
  setTab
}) => /*#__PURE__*/React.createElement("div", {
  className: "view-enter",
  style: {
    maxWidth: '800px',
    margin: '0 auto',
    width: '100%',
    paddingBottom: '40px'
  }
}, /*#__PURE__*/React.createElement("button", {
  className: "btn btn-outline",
  onClick: () => setTab('dashboard'),
  style: {
    marginBottom: '24px'
  }
}, /*#__PURE__*/React.createElement("svg", {
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}, /*#__PURE__*/React.createElement("line", {
  x1: "19",
  y1: "12",
  x2: "5",
  y2: "12"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "12 19 5 12 12 5"
})), " Return to Dashboard"), /*#__PURE__*/React.createElement("div", {
  className: "card",
  style: {
    padding: '64px',
    borderTop: '4px solid var(--accent)'
  }
}, /*#__PURE__*/React.createElement("h2", {
  style: {
    fontSize: '42px',
    marginBottom: '8px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.02em'
  }
}, "EcoPulse User Manual"), /*#__PURE__*/React.createElement("p", {
  style: {
    fontSize: '16px',
    color: 'var(--muted)',
    marginBottom: '48px',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '24px'
  }
}, "Version 1.0.0 \u2022 Official Documentation"), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: '16px',
    color: 'var(--fg)',
    lineHeight: '1.8',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px'
  }
}, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h3", {
  style: {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '12px'
  }
}, "What is EcoPulse?"), /*#__PURE__*/React.createElement("p", {
  style: {
    color: 'var(--muted)'
  }
}, "EcoPulse is a smart system that helps you save the environment by running your heavy computer tasks only when clean energy is available. It constantly checks how \"dirty\" or \"clean\" the power grid is in real-time.")), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h3", {
  style: {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '12px'
  }
}, "How does it work?"), /*#__PURE__*/React.createElement("ul", {
  style: {
    paddingLeft: '24px',
    color: 'var(--muted)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    listStyleType: 'disc'
  }
}, /*#__PURE__*/React.createElement("li", null, "The system checks the power grid (like checking the weather)."), /*#__PURE__*/React.createElement("li", null, "If the grid is using a lot of fossil fuels (like coal or gas), EcoPulse ", /*#__PURE__*/React.createElement("strong", {
  style: {
    color: 'var(--danger)'
  }
}, "pauses"), " your big, non-urgent computer tasks."), /*#__PURE__*/React.createElement("li", null, "When the sun is shining or the wind is blowing, the grid becomes \"green\". EcoPulse automatically ", /*#__PURE__*/React.createElement("strong", {
  style: {
    color: 'var(--success)'
  }
}, "resumes"), " your tasks."))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h3", {
  style: {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '12px'
  }
}, "How to use this dashboard"), /*#__PURE__*/React.createElement("ul", {
  style: {
    paddingLeft: '24px',
    color: 'var(--muted)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    listStyleType: 'disc'
  }
}, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Dashboard:"), " Watch your computers pause and resume live. See the \"Predictive Emission Curve\" to know exactly when the greenest time of day will be."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Historical Preview:"), " See exactly how much carbon (pollution) you saved every day over the last week."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Settings:"), " If there is an emergency and you need everything to stop, go here to click the big \"STOP THE SYSTEM\" button.")))), /*#__PURE__*/React.createElement("div", {
  style: {
    marginTop: '40px',
    paddingTop: '24px',
    borderTop: '1px solid var(--border)',
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: '14px'
  }
}, /*#__PURE__*/React.createElement("strong", null, "Copyright by Ranadeep Saha"))));
const ProfileView = ({
  setTab,
  profileName,
  setProfileName,
  userName,
  setUserName,
  profilePic,
  setProfilePic,
  onSignOut
}) => {
  const [localName, setLocalName] = useState(profileName);
  const [localUser, setLocalUser] = useState(userName);
  const [localPic, setLocalPic] = useState(profilePic);
  const [saved, setSaved] = useState(false);
  const handleImageUpload = e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLocalPic(reader.result);
      reader.readAsDataURL(file);
    }
  };
  const handleSave = () => {
    setProfileName(localName);
    setUserName(localUser);
    setProfilePic(localPic);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const handleDiscard = () => {
    setLocalName(profileName);
    setLocalUser(userName);
    setLocalPic(profilePic);
    setLocalName(profileName);
    setLocalUser(userName);
    setLocalPic(profilePic);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "view-enter"
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      marginBottom: '40px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '36px',
      marginBottom: '8px'
    }
  }, "Developer Profile"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--muted)',
      fontSize: '18px'
    }
  }, "Manage your identity and authentication details.")), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '600px',
      width: '100%',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '32px',
      alignSelf: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '32px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "avatar-upload"
  }, /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "image/*",
    style: {
      display: 'none'
    },
    onChange: handleImageUpload
  }), localPic ? /*#__PURE__*/React.createElement("img", {
    src: localPic,
    className: "avatar avatar-lg",
    style: {
      width: '80px',
      height: '80px'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    className: "avatar avatar-lg",
    style: {
      width: '80px',
      height: '80px',
      fontSize: '32px'
    }
  }, localName.charAt(0).toUpperCase()), /*#__PURE__*/React.createElement("div", {
    className: "avatar-overlay"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "32",
    height: "32",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "13",
    r: "4"
  })))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      color: 'var(--muted)',
      letterSpacing: '0.05em'
    }
  }, "Upload Picture")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      minWidth: '250px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "input-group"
  }, /*#__PURE__*/React.createElement("label", {
    className: "input-label"
  }, "Display Name"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input-field",
    value: localName,
    onChange: e => setLocalName(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "input-group"
  }, /*#__PURE__*/React.createElement("label", {
    className: "input-label"
  }, "Username / Email"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input-field",
    value: localUser,
    onChange: e => setLocalUser(e.target.value)
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '16px',
      borderTop: '1px solid var(--border)',
      paddingTop: '24px',
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline",
    onClick: onSignOut,
    style: {
      color: 'var(--danger)',
      borderColor: 'var(--danger)'
    }
  }, "Sign Out"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: '20px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline",
    onClick: () => {
      handleDiscard();
      setTab('dashboard');
    }
  }, "Discard"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: handleSave,
    style: {
      minWidth: '120px'
    }
  }, saved ? 'Saved!' : 'Save Profile')))));
};
const LandingPage = ({
  onLogin,
  onWelcome
}) => /*#__PURE__*/React.createElement("div", {
  className: "landing-page",
  style: {
    position: 'fixed',
    inset: 0,
    background: '#050505',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column'
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "landing-bg",
  style: {
    position: 'absolute',
    inset: 0,
    zIndex: 0
  }
}, /*#__PURE__*/React.createElement("img", {
  src: "videoframe_14142.png",
  style: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0.5
  }
})), /*#__PURE__*/React.createElement("nav", {
  className: "landing-nav",
  style: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    justifyContent: 'space-between',
    padding: '24px 48px',
    color: '#fff',
    alignItems: 'center'
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: '24px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  }
}, /*#__PURE__*/React.createElement("img", {
  src: "library.png",
  style: {
    height: '40px'
  }
}), "EcoPulse"), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    gap: '16px'
  }
}, /*#__PURE__*/React.createElement("button", {
  className: "btn btn-outline",
  style: {
    color: '#fff',
    borderColor: '#333'
  },
  onClick: onLogin
}, "Log In"), /*#__PURE__*/React.createElement("button", {
  className: "btn btn-primary",
  onClick: onWelcome
}, "Welcome"))), /*#__PURE__*/React.createElement("div", {
  className: "landing-main",
  style: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 10,
    color: '#fff',
    textAlign: 'center',
    padding: '0 24px'
  }
}, /*#__PURE__*/React.createElement("h1", {
  className: "landing-title",
  style: {
    fontSize: '80px',
    fontWeight: '800',
    marginBottom: '24px',
    letterSpacing: '-0.02em',
    lineHeight: '1.1',
    background: 'linear-gradient(180deg, #fff 0%, #a0a0a0 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  }
}, "Carbon-Aware.", /*#__PURE__*/React.createElement("br", null), "Intelligent Orchestration."), /*#__PURE__*/React.createElement("p", {
  style: {
    fontSize: '18px',
    color: '#aaa',
    maxWidth: '600px',
    marginBottom: '48px'
  }
}, "EcoPulse detects dirty energy grids in real-time and automatically shifts your massive computing workloads to green energy hours."), /*#__PURE__*/React.createElement("button", {
  className: "btn btn-primary",
  style: {
    padding: '16px 32px',
    fontSize: '18px',
    borderRadius: '50px'
  },
  onClick: onWelcome
}, "Enter Production Engine")));
const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!auth) {
      setTimeout(() => {
        setUser(null);
        setLoading(false);
      }, 50);
      return;
    }
    const unsubscribe = auth.onAuthStateChanged(u => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
  const handleLogin = async () => {
    if (!auth) {
      setUser({
        displayName: 'Guest User',
        email: 'guest@local'
      });
      return;
    }
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (e) {
      console.error(e);
      alert("Sign In Failed: " + e.message);
    }
  };
  const handleSignOut = async () => {
    if (auth) {
      await auth.signOut();
    } else {
      setUser(null);
    }
  };
  if (loading) return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, "Loading...");
  if (!user) {
    return /*#__PURE__*/React.createElement(LandingPage, {
      onLogin: handleLogin,
      onWelcome: handleLogin
    });
  }
  return /*#__PURE__*/React.createElement(DashboardApp, {
    user: user,
    onSignOut: handleSignOut
  });
};
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));