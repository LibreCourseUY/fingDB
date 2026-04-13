/**
 * fingDB - Prerequisite Graph Visualization
 * 
 * This file contains the JavaScript code that renders the interactive graph
 * showing the prerequisite relationships between courses (materias) at Fing.
 * 
 * Technologies used:
 * - Vue.js 3: Frontend framework for reactive UI
 * - D3.js v7: Data visualization library for rendering the graph
 * 
 * Key Features:
 * - Interactive zoom and pan (D3 zoom behavior)
 * - Click on nodes to view course details
 * - Filter by career and profile
 * - Search functionality
 * - Highlight prerequisite links on hover
 * - Responsive design for mobile devices
 */

const API_CONFIG = {
  /**
   * Dynamically determines the API URL based on the current page location.
   * This ensures the frontend works whether deployed at root or in a subdirectory.
   */
  apiUrl: (function() {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const lastSlash = path.lastIndexOf('/');
    const basePath = lastSlash > 0 ? path.substring(0, lastSlash) : path;
    console.log('API_URL:', origin + (basePath || '/'), 'path:', path);
    return origin + (basePath || '/');
  })(),
  
  /**
   * Retrieves the authentication token from localStorage.
   * Used for authenticated API requests.
   */
  getToken: function() {
    return localStorage.getItem('access_token') || '';
  }
};

const { createApp, ref, computed, onMounted, watch } = Vue;

/**
 * Color palette for different course periods (semesters).
 * - bisemestral (bimonthly): Blue
 * - par (even): Purple  
 * - impar (odd): Pink
 */
const PERIODO_COLORS = {
  'bisemestral': '#58a6ff',
  'par': '#bc8cff',
  'impar': '#f778ba'
};

/**
 * Returns the color for a given period string.
 * @param {string} periodo - The period name
 * @returns {string} Hex color code
 */
function getPeriodoColor(periodo) {
  if (!periodo) return '#58a6ff';
  const p = String(periodo).toLowerCase().trim();
  return PERIODO_COLORS[p] || '#58a6ff';
}

/**
 * Capitalizes the first letter of a string.
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Maps institute IDs to their human-readable names.
 * These are the departments/institutes at the Faculty of Engineering.
 */
function getInstitutoName(instituto_id) {
  const nameMap = {
    1: 'Instituto de Computación',
    2: 'Instituto de Matemática y Estadística',
    3: 'Instituto de Ingeniería Eléctrica',
    4: 'Instituto de Agrimensura',
    5: 'Instituto de Mecánica de los Fluidos',
    6: 'Instituto de Física',
    7: 'Instituto de Ingeniería Mecánica',
    8: 'Instituto de Ensayo de Materiales',
    9: 'Instituto de Estructuras y Transporte',
    10: 'Instituto de Ingeniería Química',
    11: 'Departamento de Inserción Social'
  };
  return nameMap[instituto_id] || ('Instituto #' + instituto_id);
}

/**
 * Creates authorization headers for API requests.
 * Includes Bearer token if user is logged in.
 * @returns {Object} Headers object
 */
function getAuthHeaders() {
  return {
    'Authorization': 'Bearer ' + API_CONFIG.getToken()
  };
}

createApp({
  setup() {
    const apiUrl = ref(API_CONFIG.apiUrl);
    const materias = ref([]);  // All courses from API
    const loading = ref(false);
    const error = ref(null);
    const searchQuery = ref('');
    const highlightedId = ref(null);  // Currently highlighted node
    const selectedMateria = ref(null);  // Currently selected course (for modal)
    const filtro = ref('todos');
    const sidebarCollapsed = ref(false);
    const isMobile = ref(false);
    
    // Career and profile filtering
    const selectedCareer = ref(null);
    const selectedProfile = ref(null);
    const mathInitEnabled = ref(true);  // Toggle for "Matemática Inicial" course
    const carreras = ref([]);
    const perfiles = ref([]);
    
    // Disclaimer state
    const DISCLAIMER_STORAGE_KEY = 'fingdb_terms_accepted';
    const showDisclaimer = ref(!localStorage.getItem(DISCLAIMER_STORAGE_KEY));

    const acceptDisclaimer = () => {
        localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true');
        showDisclaimer.value = false;
    };

    // Authentication state
    const isLoggedIn = ref(false);
    const showLoginModal = ref(false);
    const loginUsername = ref('');
    const loginPassword = ref('');
    const loginError = ref('');
    const loginLoading = ref(false);
    
    /**
     * Removes accents from a string for search functionality.
     * This allows searching "informatica" to match "informática".
     * @param {string} str - Input string
     * @returns {string} String without accents
     */
    function removeAccents(str) {
      if (!str) return '';
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    
    // D3.js SVG elements
    let svg = null;      // Main SVG element
    let g = null;        // Group element for zoom/pan
    let zoom = null;     // D3 zoom behavior
    let nodeMap = new Map();  // Map of node IDs to node objects
    let containerBounds = null;
    let currentTransform = d3.zoomIdentity;  // Current zoom/pan state

    /**
     * Computed property that filters courses based on:
     * - Selected career
     * - Selected profile
     * - Search query
     */
    const filteredMaterias = computed(() => {
      let result = materias.value;
      
      // Filter by career
      if (selectedCareer.value) {
        const obligatoriasIds = new Set((selectedCareer.value.materias_obligatorias || []).map(m => Number(m.id)));
        const opcionalesIds = new Set((selectedCareer.value.materias_opcionales || []).map(m => Number(m.id)));
        let careerMateriaIds = new Set([...obligatoriasIds, ...opcionalesIds]);
        
        // Add profile courses if selected
        if (selectedProfile.value) {
          const profileObligatorias = selectedProfile.value.materias_obligatorias || [];
          profileObligatorias.forEach(m => careerMateriaIds.add(Number(m.id)));
        }
        
        result = result.filter(m => careerMateriaIds.has(Number(m.id)));
      }
      
      // Filter by search query
      if (searchQuery.value) {
        const q = removeAccents(searchQuery.value.toLowerCase());
        result = result.filter(m => removeAccents(m.name.toLowerCase()).includes(q));
      }
      
      return result;
    });

    function setFiltro(val) {
      filtro.value = val;
    }

    /**
     * Loads the list of careers (carreras) from the API.
     * Careers determine which courses are mandatory vs optional.
     */
    async function loadCarreras() {
      try {
        const response = await fetch(`${apiUrl.value}/carreras`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          carreras.value = await response.json();
          setTimeout(function() { renderGraph(); }, 100);
        }
      } catch (e) {
        console.error('Error loading carreras:', e);
      }
    }
    
    /**
     * Loads profiles (specializations) for a given career.
     * Profiles are specializations within a career (e.g., Software, Industrial).
     */
    async function loadPerfiles(carreraId) {
      try {
        const response = await fetch(`${apiUrl.value}/perfiles/by-carrera/${carreraId}`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          perfiles.value = await response.json();
        }
      } catch (e) {
        console.error('Error loading perfiles:', e);
      }
    }

    /**
     * Handles career selection change.
     * Loads associated profiles and re-renders the graph.
     */
    function onCareerChange() {
      const oldCareer = selectedCareer.value ? selectedCareer.value.name : null;
      selectedProfile.value = null;
      if (selectedCareer.value) {
        sendEvent('career_select', {
          career_id: selectedCareer.value.id,
          career_name: selectedCareer.value.name,
          previous_career: oldCareer
        });
        loadPerfiles(selectedCareer.value.id).then(function() {
          renderGraph();
        });
      } else {
        perfiles.value = [];
        sendEvent('career_deselect', { previous_career: oldCareer });
        renderGraph();
      }
    }
    
    /**
     * Handles profile selection change.
     */
    function onProfileChange() {
      if (selectedProfile.value) {
        sendEvent('profile_select', {
          profile_id: selectedProfile.value.id,
          profile_name: selectedProfile.value.name,
          career_id: selectedCareer.value ? selectedCareer.value.id : null
        });
      }
      setTimeout(function() { renderGraph(); }, 100);
    }
    
    /**
     * Handles toggle for "Matemática Inicial" course visibility.
     * Some careers include this as a prerequisite, others don't.
     */
    function onMathInitChange() {
      sendEvent('math_init_toggle', {
        enabled: mathInitEnabled.value
      });
      setTimeout(function() { renderGraph(); }, 100);
    }

    /**
     * Determines the status of a course within a selected career.
     * @param {number} materiaId - Course ID
     * @returns {string|null} Status: 'obligatoria', 'opcional', 'perfil_obligatoria', or null
     */
    function getMateriaStatus(materiaId) {
      if (!selectedCareer.value) {
        return null;
      }
      
      const oid = Number(materiaId);
      const obligatorias = selectedCareer.value.materias_obligatorias || [];
      const opcionales = selectedCareer.value.materias_opcionales || [];
      
      // Check profile courses first
      if (selectedProfile.value) {
        const perfilObligatorias = selectedProfile.value.materias_obligatorias || [];
        for (const pm of perfilObligatorias) {
          if (Number(pm.id) === oid) {
            return 'perfil_obligatoria';
          }
        }
      }
      
      // Check mandatory courses
      for (const m of obligatorias) {
        if (Number(m.id) === oid) {
          return 'obligatoria';
        }
      }
      
      // Check optional courses
      for (const m of opcionales) {
        if (Number(m.id) === oid) {
          return 'opcional';
        }
      }
      
      return 'excluded';
    }

    const institutos = ref([]);
    
    /**
     * Loads all course data from the API.
     * Fetches institutes and courses with their prerequisites.
     */
    async function loadData() {
      loading.value = true;
      error.value = null;
      
      try {
        // Load institutes
        const instResponse = await fetch(`${apiUrl.value}/institutos`, {
          headers: getAuthHeaders()
        });
        if (instResponse.ok) {
          institutos.value = await instResponse.json();
        }
        
        // Load all courses with prerequisites
        const response = await fetch(`${apiUrl.value}/materias/all/con-previas`, {
          headers: getAuthHeaders()
        });
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}`);
        }
        
        materias.value = await response.json();
      } catch (e) {
        error.value = e.message;
        console.error('Load error:', e);
      } finally {
        loading.value = false;
      }
    }

    /**
     * Builds the graph data structure from course data.
     * This transforms the API response into nodes and links for D3.js.
     * 
     * The graph represents:
     * - Nodes: Courses (materias)
     * - Links: Prerequisite relationships (if A requires B, there's an edge B -> A)
     * 
     * @returns {Object} Object with nodes and links arrays
     */
    function buildGraphData() {
      let materiasList = [...materias.value];
      
      // Filter out "Matemática Inicial" if disabled
      const mathInitMateria = materiasList.find(m => 
        removeAccents(m.name.toLowerCase()).includes('matematica inicial')
      );
      
      if (!mathInitEnabled.value && mathInitMateria) {
        const mathInitId = mathInitMateria.id;
        materiasList = materiasList.filter(m => m.id !== mathInitId);
        
        // Also remove references to this course from prerequisites
        materiasList = materiasList.map(m => {
          const previasAprobado = (m.previas_aprobado || []).filter(p => p.id !== mathInitId);
          const previasExonerado = (m.previas_exonerado || []).filter(p => p.id !== mathInitId);
          return {
            ...m,
            previas_aprobado: previasAprobado,
            previas_exonerado: previasExonerado
          };
        });
      }
      
      // Filter by career if selected
      if (selectedCareer.value) {
        const obligatoriasIds = new Set((selectedCareer.value.materias_obligatorias || []).map(m => Number(m.id)));
        const opcionalesIds = new Set((selectedCareer.value.materias_opcionales || []).map(m => Number(m.id)));
        let careerMateriaIds = new Set([...obligatoriasIds, ...opcionalesIds]);
        
        if (selectedProfile.value) {
          const profileObligatorias = selectedProfile.value.materias_obligatorias || [];
          profileObligatorias.forEach(m => careerMateriaIds.add(Number(m.id)));
        }
        
        materiasList = materiasList.filter(m => careerMateriaIds.has(Number(m.id)));
      }
      
      // Create nodes from courses
      const nodes = materiasList.map(m => {
        console.log('Mapping materia:', m.name, 'codigo:', m.codigo);
        return {
          id: m.id,
          name: m.name,
          codigo: m.codigo || null,
          periodo: m.periodo,
          creditos: m.creditos || 0,
          min_creditos: m.min_creditos || null,
          instituto_id: m.instituto_id,
          hasPrevia: ((m.previas_aprobado?.length || 0) > 0) || ((m.previas_exonerado?.length || 0) > 0)
        };
      });
      
      // Create links (prerequisite edges)
      // Direction: prerequisite -> course (if A requires B, edge is B -> A)
      const links = [];
      
      materiasList.forEach(materia => {
        const allPrevias = [
          ...(materia.previas_aprobado || []),
          ...(materia.previas_exonerado || [])
        ];
        allPrevias.forEach(prev => {
          // Only create link if both source and target exist in filtered list
          const prevExists = materiasList.some(m => m.id === prev.id);
          if (prevExists) {
            links.push({ source: prev.id, target: materia.id });
          }
        });
      });
      
      return { nodes, links };
    }

    /**
     * Calculates the "level" (semester) of each course in the graph.
     * 
     * This uses a recursive algorithm:
     * - Courses with no prerequisites are at level 0
     * - A course's level = max(level of all its prerequisites) + 1
     * 
     * This creates a topological ordering useful for visualization.
     * 
     * @param {Array} nodes - Array of node objects
     * @param {Array} links - Array of link objects
     * @returns {Map} Map of node ID to level number
     */
    function calculateLevels(nodes, links) {
      const levels = new Map();
      
      /**
       * Recursively calculates the level of a node.
       * Uses memoization and visited set to handle cycles.
       */
      function getLevel(nodeId, visited = new Set()) {
        // Cycle detection
        if (visited.has(nodeId)) return 0;
        visited.add(nodeId);
        
        // Find all links pointing TO this node (incoming prerequisites)
        const incomingLinks = links.filter(l => {
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return targetId === nodeId;
        });
        
        // If no prerequisites, this is a first-semester course
        if (incomingLinks.length === 0) {
          levels.set(nodeId, 0);
          return 0;
        }
        
        // Level = max level of all prerequisites + 1
        let maxPrevLevel = 0;
        incomingLinks.forEach(l => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          maxPrevLevel = Math.max(maxPrevLevel, getLevel(sourceId, new Set(visited)));
        });
        
        const finalLevel = maxPrevLevel + 1;
        levels.set(nodeId, finalLevel);
        return finalLevel;
      }
      
      // Calculate levels for all nodes
      nodes.forEach(n => {
        if (!levels.has(n.id)) {
          getLevel(n.id);
        }
      });
      
      return levels;
    }

    /**
     * Main graph rendering function using D3.js.
     * 
     * This function:
     * 1. Creates an SVG container
     * 2. Sets up zoom/pan behavior
     * 3. Calculates node positions using a custom layout algorithm
     * 4. Renders edges (prerequisite links) as curved paths
     * 5. Renders nodes as styled rectangles
     * 
     * Layout Algorithm:
     * - Nodes are grouped by institute (department)
     * - Within each institute, nodes are arranged by semester level
     * - Maximum 4 nodes per row; overflow wraps to next visual row
     * - Conflict resolution ensures prerequisite edges flow downward
     */
    function renderGraph() {
      const savedTransform = currentTransform;
      
      // Clear previous SVG
      const container = document.getElementById('graph');
      container.innerHTML = '';
      
      svg = null;
      g = null;
      zoom = null;
      nodeMap.clear();
      
      containerBounds = container.getBoundingClientRect();
      const width = containerBounds.width;
      const height = containerBounds.height;
      
      // Create SVG element
      svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
      
      // Define arrow marker for directed edges
      const defs = svg.append('defs');
      
      defs.append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -4 8 8')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .append('path')
        .attr('d', 'M 0,-3 L 6,0 L 0,3')
        .attr('fill', '#30363d');

      // Create main group for zoom/pan
      g = svg.append('g').attr('class', 'smooth-transition');
      
      // Set up zoom behavior
      // - Scale range: 0.3x to 2x
      // - Smooth transitions between states
      zoom = d3.zoom()
        .scaleExtent([0.3, 2])
        .on('zoom', (event) => {
          g.classed('smooth-transition', false);
          currentTransform = event.transform;
          g.attr('transform', event.transform);
        })
        .on('end', () => {
          g.classed('smooth-transition', true);
        });
      
      // Apply zoom to SVG, disable double-click zoom
      svg.call(zoom).on('dblclick.zoom', null);
      
      // Restore previous zoom state if exists
      if (savedTransform && savedTransform !== d3.zoomIdentity) {
        g.classed('smooth-transition', true);
        svg.call(zoom.transform, savedTransform);
        currentTransform = savedTransform;
      } else {
        g.classed('smooth-transition', true);
      }
      
      // Build graph data from courses
      const { nodes, links } = buildGraphData();
      
      if (nodes.length === 0) {
        return;
      }

      // Calculate semester levels for layout
      const levels = calculateLevels(nodes, links);
      
      // Group nodes by institute (department)
      const nodesByInstituto = {};
      nodes.forEach(n => {
        const instId = n.instituto_id || 0;
        if (!nodesByInstituto[instId]) {
          nodesByInstituto[instId] = [];
        }
        nodesByInstituto[instId].push(n);
      });
      
      const instituteIds = Object.keys(nodesByInstituto).sort((a, b) => a - b);
      
      // Visual layout parameters
      const MAX_NODES_PER_LEVEL = 4;  // Max nodes per row before wrapping
      const visualLevels = [];
      const nodeVisualLevels = {};
      
      /**
       * Assign visual levels to nodes, handling overflow.
       * When more than 4 nodes exist at the same semester level within
       * an institute, they wrap to additional visual rows.
       */
      instituteIds.forEach(instId => {
        const instNodes = nodesByInstituto[instId];
        
        // Group by semester level
        const levelGroups = {};
        instNodes.forEach(n => {
          const origLevel = levels.get(n.id) || 0;
          if (!levelGroups[origLevel]) {
            levelGroups[origLevel] = [];
          }
          levelGroups[origLevel].push(n);
        });
        
        let instNextLevel = {};
        Object.keys(levelGroups).forEach(origLevel => {
          const groupNodes = levelGroups[origLevel];
          
          // Assign visual levels with overflow handling
          groupNodes.forEach((node, idx) => {
            let baseLevel = parseInt(origLevel);
            if (!instNextLevel[instId]) instNextLevel[instId] = {};
            
            if (instNextLevel[instId][baseLevel] === undefined) {
              instNextLevel[instId][baseLevel] = baseLevel;
            }
            
            let visualLevel = instNextLevel[instId][baseLevel];
            if (idx >= MAX_NODES_PER_LEVEL) {
              const overflowLevels = Math.floor(idx / MAX_NODES_PER_LEVEL);
              visualLevel = baseLevel + overflowLevels;
            }
            
            // Update tracking for next overflow
            if (idx === MAX_NODES_PER_LEVEL - 1 || (idx > MAX_NODES_PER_LEVEL && (idx + 1) % MAX_NODES_PER_LEVEL === 0)) {
              const nextOverflow = Math.floor((idx + 1) / MAX_NODES_PER_LEVEL);
              instNextLevel[instId][baseLevel] = baseLevel + nextOverflow;
            }
            
            nodeVisualLevels[node.id] = visualLevel;
            
            while (visualLevels.length <= visualLevel) {
              visualLevels.push([]);
            }
            visualLevels[visualLevel].push({ node, instId });
          });
        });
      });
      
      /**
       * Conflict Resolution Pass
       * 
       * Ensures that for every edge (source -> target),
       * the target is visually below the source.
       * If not, adjust the target's level.
       */
      let hasConflicts = true;
      while (hasConflicts) {
        hasConflicts = false;
        
        links.forEach(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          
          const sourceLevel = nodeVisualLevels[sourceId];
          const targetLevel = nodeVisualLevels[targetId];
          
          if (targetLevel <= sourceLevel) {
            nodeVisualLevels[targetId] = sourceLevel + 1;
            hasConflicts = true;
          }
        });
      }

      // Rebuild final visual levels after conflict resolution
      const finalVisualLevels = [];
      Object.keys(nodeVisualLevels).forEach(nodeId => {
        const vl = nodeVisualLevels[nodeId];
        const node = nodes.find(n => n.id === Number(nodeId));
        const instId = node ? (node.instituto_id || 0) : 0;
        while (finalVisualLevels.length <= vl) {
          finalVisualLevels.push([]);
        }
        finalVisualLevels[vl].push({ node, instId: String(instId) });
      });

      // Layout dimensions
      const nodeWidth = 200;
      const nodeHeight = 64;
      const horizontalGap = 30;
      const verticalGap = 80;
      const marginX = 100;
      const marginY = 60;
      const instituteGap = 80;
      
      // Calculate maximum width for each institute (for centering)
      const instituteMaxWidth = {};
      instituteIds.forEach(instId => {
        let maxCount = 0;
        for (let vLevel = 0; vLevel < finalVisualLevels.length; vLevel++) {
          const count = finalVisualLevels[vLevel].filter(item => item.instId == instId).length;
          if (count > maxCount) maxCount = count;
        }
        instituteMaxWidth[instId] = maxCount * nodeWidth + Math.max(0, maxCount - 1) * horizontalGap;
      });
      
      // Calculate starting X position for each institute
      const instituteStartX = {};
      let currentX = marginX;
      instituteIds.forEach(instId => {
        instituteStartX[instId] = currentX;
        currentX += instituteMaxWidth[instId] + instituteGap;
      });
      
      // Center the entire graph in the viewport
      const totalWidth = currentX - marginX;
      const viewportCenter = width / 2;
      const globalOffsetX = viewportCenter - totalWidth / 2;
      
      // Position nodes
      for (let vLevel = 0; vLevel < finalVisualLevels.length; vLevel++) {
        const levelItems = finalVisualLevels[vLevel];
        if (levelItems.length === 0) continue;
        
        const y = marginY + vLevel * (nodeHeight + verticalGap);
        
        // Group items by institute
        const byInstitute = {};
        levelItems.forEach(item => {
          const instId = item.instId;
          if (!byInstitute[instId]) byInstitute[instId] = [];
          byInstitute[instId].push(item.node);
        });
        
        // Position nodes within each institute
        instituteIds.forEach(instId => {
          const nodesAtThisLevel = byInstitute[instId] || [];
          if (nodesAtThisLevel.length === 0) return;
          
          const instStart = instituteStartX[instId] + globalOffsetX - marginX;
          const instWidth = instituteMaxWidth[instId];
          const groupWidth = nodesAtThisLevel.length * nodeWidth + Math.max(0, nodesAtThisLevel.length - 1) * horizontalGap;
          const startX = instStart + (instWidth - groupWidth) / 2;
          
          nodesAtThisLevel.forEach((node, i) => {
            node.x = startX + i * (nodeWidth + horizontalGap) + nodeWidth / 2;
            node.y = y + nodeHeight / 2;
          });
        });
      }

      nodeMap.clear();

      /**
       * Render edges (prerequisite links) as curved Bezier paths.
       * Each edge goes from a prerequisite to the course that requires it.
       */
      links.forEach(linkData => {
        const sourceNode = nodes.find(n => n.id === (typeof linkData.source === 'object' ? linkData.source.id : linkData.source));
        const targetNode = nodes.find(n => n.id === (typeof linkData.target === 'object' ? linkData.target.id : linkData.target));
        
        if (!sourceNode || !targetNode) return;
        
        // Calculate edge endpoints
        const x1 = sourceNode.x;
        const y1 = sourceNode.y + nodeHeight / 2 + 2;  // Bottom of source node
        const x2 = targetNode.x;
        const y2 = targetNode.y - nodeHeight / 2 - 2;  // Top of target node
        
        // Create curved path using Bezier curve
        const midY = (y1 + y2) / 2;
        
        const path = d3.path();
        path.moveTo(x1, y1);
        path.bezierCurveTo(x1, midY, x2, midY, x2, y2);
        
        g.append('path')
          .attr('class', 'link')
          .attr('data-source', linkData.source)
          .attr('data-target', linkData.target)
          .attr('d', path.toString())
          .style('pointer-events', 'none')
          .style('fill', 'none')
          .style('stroke', '#8b949e')
          .style('stroke-width', '1.5px')
          .style('opacity', '0.7');
      });
      
      /**
       * Render nodes (courses) as styled rectangles.
       * Each node shows:
       * - Course name (truncated if necessary)
       * - Course code (if available)
       * - Credits information
       * - Period color indicator
       */
      const node = g.selectAll('.node-card')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node-card')
        .attr('transform', d => `translate(${d.x - nodeWidth/2}, ${d.y - nodeHeight/2})`)
        .style('cursor', 'pointer');

      // Node background rectangle
      node.append('rect')
        .attr('width', nodeWidth)
        .attr('height', nodeHeight)
        .attr('rx', 6)
        .style('fill', '#21262d')
        .style('stroke', function(d) {
          const status = getMateriaStatus(d.id);
          if (status === 'obligatoria') return '#ffffff';
          if (status === 'perfil_obligatoria') return '#f0883e';
          if (status === 'opcional') return '#d4a72c';
          return '#30363d';
        })
        .style('stroke-width', function(d) {
          const status = getMateriaStatus(d.id);
          return (status === 'obligatoria' || status === 'perfil_obligatoria' || status === 'opcional') ? '3px' : '1px';
        })
        .style('cursor', 'pointer')
        .on('mouseenter', function(event, d) {
          highlightLinks(d.id);
        })
        .on('mouseleave', function(event, d) {
          clearHighlight();
        })
        .on('click', function(event, d) {
          event.stopPropagation();
          const materia = materias.value.find(m => m.id === d.id);
          selectedMateria.value = materia;
          if (materia) {
            sendEvent('materia_click', {
              materia_id: materia.id,
              materia_name: materia.name,
              materia_codigo: materia.codigo || null,
              materia_periodo: materia.periodo,
              materia_creditos: materia.creditos,
              materia_min_creditos: materia.min_creditos || null,
              instituto_id: materia.instituto_id
            });
          }
        });

      // Period color indicator dot
      node.append('circle')
        .attr('cx', 10)
        .attr('cy', nodeHeight / 2)
        .attr('r', 5)
        .attr('fill', d => getPeriodoColor(d.periodo));

      // Text rendering with word wrapping
      const lineHeight = 12;
      const startY = 18;
      const maxLines = 2;
      
      node.each(function(d) {
        const words = d.name.split(' ');
        let lines = [];
        let currentLine = '';
        
        // Simple word wrap: break lines longer than 30 chars
        words.forEach(word => {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          if (testLine.length <= 30) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        });
        if (currentLine) lines.push(currentLine);
        if (lines.length > maxLines) {
          lines = lines.slice(0, maxLines);
          lines[maxLines - 1] = lines[maxLines - 1].slice(0, 27) + '...';
        }
        
        const group = d3.select(this);
        
        // Render course name lines
        lines.forEach((line, i) => {
          group.append('text')
            .attr('x', nodeWidth / 2)
            .attr('y', startY + i * lineHeight)
            .attr('text-anchor', 'middle')
            .text(line);
        });
        
        // Render course code if available
        if (d.codigo) {
          console.log('Rendering codigo:', d.codigo, 'for materia:', d.name);
          group.append('text')
            .attr('class', 'codigo')
            .attr('x', nodeWidth / 2)
            .attr('y', nodeHeight - 22)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#8b949e')
            .text(d.codigo);
        }
        
        // Render credits info
        group.append('text')
          .attr('class', 'creditos')
          .attr('x', nodeWidth / 2)
          .attr('y', nodeHeight - 10)
          .attr('text-anchor', 'middle')
          .text(d.min_creditos ? `${d.creditos} créd. (mín: ${d.min_creditos})` : `${d.creditos} créd.`);
      });
    }

    /**
     * Focuses on a specific node and optionally opens its detail modal.
     * Also zooms/pans to center the node in the viewport.
     * 
     * @param {number} id - Node ID to focus on
     * @param {boolean} openModal - Whether to open the detail modal
     */
    function focusAndOpenModal(id, openModal = true) {
      try {
        if (!g) return;
        
        const materia = materias.value.find(m => m.id === id);
        if (materia) {
          sendEvent('materia_focus', {
            materia_id: materia.id,
            materia_name: materia.name,
            materia_codigo: materia.codigo || null,
            open_modal: openModal
          });
          trackFingdbMetrics('fingdb_click', {
            materia_id: materia.id,
            materia_name: materia.name
          });
        }
        
        if (isMobile.value) {
          sidebarCollapsed.value = true;
        }
        
        const container = document.getElementById('graph');
        const bounds = container.getBoundingClientRect();
        const width = bounds.width;
        const height = bounds.height;
        
        // Recreate graph data (same logic as buildGraphData)
        let materiasList = [...materias.value];
        
        const mathInitMateria = materiasList.find(m => 
          removeAccents(m.name.toLowerCase()).includes('matematica inicial')
        );
        if (!mathInitEnabled.value && mathInitMateria) {
          materiasList = materiasList.filter(m => m.id !== mathInitMateria.id);
        }
        
        if (selectedCareer.value) {
          const obligatoriasIds = new Set((selectedCareer.value.materias_obligatorias || []).map(m => Number(m.id)));
          const opcionalesIds = new Set((selectedCareer.value.materias_opcionales || []).map(m => Number(m.id)));
          let careerMateriaIds = new Set([...obligatoriasIds, ...opcionalesIds]);
          
          if (selectedProfile.value) {
            const profileObligatorias = selectedProfile.value.materias_obligatorias || [];
            profileObligatorias.forEach(m => careerMateriaIds.add(Number(m.id)));
          }
          
          materiasList = materiasList.filter(m => careerMateriaIds.has(Number(m.id)));
        }
        
        const nodesAll = materiasList.map(m => ({
          id: m.id,
          name: m.name,
          codigo: m.codigo || null,
          periodo: m.periodo,
          creditos: m.creditos || 0,
          min_creditos: m.min_creditos || null,
          instituto_id: m.instituto_id,
          hasPrevia: ((m.previas_aprobado?.length || 0) > 0) || ((m.previas_exonerado?.length || 0) > 0)
        }));
        
        const linksAll = [];
        materiasList.forEach(materia => {
          const allPrevias = [
            ...(materia.previas_aprobado || []),
            ...(materia.previas_exonerado || [])
          ];
          allPrevias.forEach(prev => {
            if (materiasList.some(m => m.id === prev.id)) {
              linksAll.push({ source: prev.id, target: materia.id });
            }
          });
        });
        
        const levelsAll = calculateLevels(nodesAll, linksAll);
        
        // (Simplified layout calculation - same as renderGraph)
        // ... (layout code omitted for brevity)
        
        const nodeData = nodesAll.find(n => n.id === id);
        
        if (!nodeData) {
          return;
        }
        
        // Calculate zoom transform to center on node
        const scale = 1.2;
        const centerX = width / 2;
        const centerY = height / 2;
        const newX = centerX - nodeData.x * scale;
        const newY = centerY - nodeData.y * scale;
        
        const transform = d3.zoomIdentity.translate(newX, newY).scale(scale);
        
        // Apply transform with smooth transition
        g.classed('smooth-transition', true);
        g.attr('transform', transform.toString());
        currentTransform = transform;
        
        if (openModal) {
          const materia = materias.value.find(m => m.id === id);
          if (materia) {
            selectedMateria.value = materia;
          }
        }
      } catch (e) {
        console.error('Focus error:', e);
      }
    }

    /**
     * Highlights prerequisite links connected to a specific node.
     * - Incoming links (courses that require this one): Green
     * - Outgoing links (prerequisites for this course): Red
     * - Other links: Dimmed
     * 
     * @param {number} id - Node ID to highlight
     */
    function highlightLinks(id) {
      if (!g) return;
      
      g.selectAll('.link').each(function() {
        const el = d3.select(this);
        const sourceId = parseInt(el.attr('data-source'));
        const targetId = parseInt(el.attr('data-target'));
           
        if (targetId === id) {
          // This course requires the highlighted course
          el.style('stroke', '#f85149').style('stroke-width', '2.5px').style('stroke-opacity', '1');
        } else if (sourceId === id) {
          // The highlighted course is a prerequisite for this one
          el.style('stroke', '#3fb950').style('stroke-width', '2.5px').style('stroke-opacity', '1');
        } else {
          // Unrelated links get dimmed
          el.style('stroke', '').style('stroke-width', '').style('stroke-opacity', '0.2');
        }
      });
    }

    /**
     * Clears all link highlighting, restoring default styles.
     */
    function clearHighlight() {
      if (!g) return;
      g.selectAll('.link')
        .style('stroke', '')
        .style('stroke-width', '')
        .style('stroke-opacity', '');
    }

    /**
     * Handles search input changes.
     * Highlights the first matching result.
     */
    function onSearchInput() {
      if (searchQuery.value && filteredMaterias.value.length > 0) {
        highlightedId.value = filteredMaterias.value[0].id;
      } else {
        highlightedId.value = null;
      }
    }

    /**
     * Resets the view to default (centered, no zoom).
     */
    function resetView() {
      try {
        if (g) {
          g.attr('transform', 'translate(0, 0) scale(1)');
        }
        currentTransform = d3.zoomIdentity;
        highlightedId.value = null;
        searchQuery.value = '';
      } catch (e) {
        console.error('Reset view error:', e);
      }
    }

    function closeModal() {
      selectedMateria.value = null;
    }

    function toggleSidebar() {
      sidebarCollapsed.value = !sidebarCollapsed.value;
    }
    
    /**
     * Checks if the device is mobile based on viewport width.
     */
    function checkMobile() {
      isMobile.value = window.innerWidth <= 768;
      if (isMobile.value) {
        sidebarCollapsed.value = true;
      } else {
        sidebarCollapsed.value = false;
      }
    }
    
    /**
     * Handles clicks outside the sidebar on mobile to close it.
     */
    function handleClickOutside(event) {
      if (!isMobile.value) return;
      const sidebar = document.querySelector('.sidebar');
      const toggleBtn = document.querySelector('.sidebar-toggle');
      if (sidebar && !sidebar.contains(event.target) && !toggleBtn?.contains(event.target)) {
        sidebarCollapsed.value = true;
      }
    }
    
    /**
     * Checks if user is logged in by verifying the token.
     */
    async function checkLoginStatus() {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const res = await fetch(`${apiUrl.value}/auth/verify`, {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (res.ok) {
            const data = await res.json();
            isLoggedIn.value = data.valid;
          } else {
            localStorage.removeItem('access_token');
            isLoggedIn.value = false;
          }
        } catch (e) {
          isLoggedIn.value = false;
        }
      }
    }
    
    /**
     * Performs login with username and password.
     */
    async function doLogin() {
      loginLoading.value = true;
      loginError.value = '';
      try {
        const res = await fetch(`${apiUrl.value}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: loginUsername.value,
            password: loginPassword.value
          })
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('access_token', data.access_token);
          isLoggedIn.value = true;
          showLoginModal.value = false;
          loginUsername.value = '';
          loginPassword.value = '';
          window.location.href = apiUrl.value + '/admin';
        } else {
          const data = await res.json();
          loginError.value = data.detail || 'Error al iniciar sesión';
        }
      } catch (e) {
        loginError.value = 'Error de conexión';
      } finally {
        loginLoading.value = false;
      }
    }
    
    /**
     * Logs out the current user.
     */
    function logout() {
      const token = localStorage.getItem('access_token');
      if (token) {
        fetch(`${apiUrl.value}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
      }
      localStorage.removeItem('access_token');
      isLoggedIn.value = false;
    }
    
    /**
     * Redirects to the admin panel.
     */
    function goToAdmin() {
      window.location.href = apiUrl.value + '/admin';
    }
    
    /**
     * Sends performance metrics to analytics service.
     * Tracks page load times and user agent info.
     */
    function sendMetrics() {
      const navigationTiming = performance.timing || performance.getEntriesByType('navigation')[0];
      const loadTime = navigationTiming ? navigationTiming.loadEventEnd - navigationTiming.fetchStart : 0;
      const domContentLoaded = navigationTiming ? navigationTiming.domContentLoadedEventEnd - navigationTiming.fetchStart : 0;
      
      const metricsData = {
        url: window.location.href,
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        load_time_ms: loadTime,
        dom_content_loaded_ms: domContentLoaded,
        timestamp: new Date().toISOString()
      };
      
      fetch('https://api.ego-services.com/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metricsData)
      }).catch(() => {});
    }
    
    /**
     * Sends custom events to analytics service.
     * Tracks user interactions like clicking courses, selecting careers, etc.
     * 
     * @param {string} eventType - Type of event (e.g., 'materia_click', 'career_select')
     * @param {Object} metadata - Event-specific data
     */
    function sendEvent(eventType, metadata) {
      const eventData = {
        event_type: eventType,
        metadata: metadata,
        timestamp: new Date().toISOString(),
        url: window.location.href
      };
      
      fetch('https://api.ego-services.com/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      }).catch(() => {});
    }
    
    function trackFingdbMetrics(eventType, metadata = {}) {
      fetch('/api/metrics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, metadata })
      }).catch(() => {});
    }
    
    function trackFingdbView() {
      fetch('/api/metrics/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: window.location.pathname,
          referrer: document.referrer,
          user_agent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          document_title: document.title
        })
      }).catch(() => {});
    }
    
    // Initialize component on mount
    onMounted(() => {
      checkLoginStatus();
      loadCarreras().then(function() {
        loadData().then(function() {
          renderGraph();
          sendMetrics();
          trackFingdbView();
        });
      });
      checkMobile();
      document.addEventListener('click', handleClickOutside);
      window.addEventListener('resize', checkMobile);
    });
    
    // Watch for career/profile changes
    watch(selectedCareer, (newVal, oldVal) => {
      onCareerChange();
    });
    
    watch(selectedProfile, (newVal, oldVal) => {
      if (newVal !== null) {
        onProfileChange();
      }
    });

    return {
      apiUrl,
      materias,
      loading,
      error,
      searchQuery,
      highlightedId,
      filteredMaterias,
      selectedMateria,
      filtro,
      sidebarCollapsed,
      isMobile,
      selectedCareer,
      selectedProfile,
      mathInitEnabled,
      carreras,
      perfiles,
      institutos,
      isLoggedIn,
      showLoginModal,
      loginUsername,
      loginPassword,
      loginError,
      loginLoading,
      getInstitutoName,
      setFiltro,
      loadData,
      loadCarreras,
      onCareerChange,
      onProfileChange,
      onMathInitChange,
      resetView,
      focusAndOpenModal,
      onSearchInput,
      closeModal,
      toggleSidebar,
      highlightLinks,
      clearHighlight,
      capitalize,
      doLogin,
      logout,
      goToAdmin,
      showDisclaimer,
      acceptDisclaimer
    };
  }
}).mount('#app');
