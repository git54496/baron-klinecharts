/*
 * Tabler-derived paths in this review page are used under the MIT License.
 * See /licenses/Tabler-Icons-LICENSE.
 */

const ICONS = {
	horizontalRay: `
		<path d="M3 12h19" />
		<circle cx="5" cy="12" r="2" />
		<circle cx="13" cy="12" r="1.5" />
	`,
	horizontalSegment: `
		<path d="M5 12h14" />
		<circle cx="5" cy="12" r="2" />
		<circle cx="19" cy="12" r="2" />
	`,
	horizontalStraight: `
		<path d="M2 12h20" />
		<circle cx="8" cy="12" r="1.5" />
		<circle cx="16" cy="12" r="1.5" />
	`,
	verticalRay: `
		<path d="M12 22v-19" />
		<circle cx="12" cy="19" r="2" />
		<circle cx="12" cy="11" r="1.5" />
	`,
	verticalSegment: `
		<path d="M12 19v-14" />
		<circle cx="12" cy="19" r="2" />
		<circle cx="12" cy="5" r="2" />
	`,
	verticalStraight: `
		<path d="M12 22v-20" />
		<circle cx="12" cy="16" r="1.5" />
		<circle cx="12" cy="8" r="1.5" />
	`,
	ray: `
		<path d="M3 21l19 -19" />
		<circle cx="5" cy="19" r="2" />
		<circle cx="12" cy="12" r="1.5" />
	`,
	segment: `
		<path d="M5 19l14 -14" />
		<circle cx="5" cy="19" r="2" />
		<circle cx="19" cy="5" r="2" />
	`,
	straight: `
		<path d="M2 22l20 -20" />
		<circle cx="8" cy="16" r="1.5" />
		<circle cx="16" cy="8" r="1.5" />
	`,
	priceLine: `
		<path d="M3 12h9" />
		<path d="M15 8h6v8h-6l-3 -4z" />
	`,
	priceChannel: `
		<path d="M3 16l12 -12" />
		<path d="M9 22l12 -12" />
		<path d="M6 19l12 -12" stroke-dasharray="2 3" />
	`,
	parallelStraight: `
		<path d="M2 16l14 -14" />
		<path d="M8 22l14 -14" />
		<circle cx="8" cy="10" r="1.5" />
		<circle cx="16" cy="14" r="1.5" />
	`,
	fibonacci: `
		<path d="M4 4h16" />
		<path d="M4 8h12" />
		<path d="M4 12h16" />
		<path d="M4 17h12" />
		<path d="M4 21h16" />
		<path d="M5 4l14 17" />
	`,
	brush: `
		<path d="M3 21v-4a4 4 0 1 1 4 4h-4" />
		<path d="M21 3a16 16 0 0 0 -12.8 10.2" />
		<path d="M21 3a16 16 0 0 1 -10.2 12.8" />
		<path d="M10.6 9a9 9 0 0 1 4.4 4.4" />
	`,
	pencil: `
		<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
		<path d="M13.5 6.5l4 4" />
	`,
	tag: `
		<path d="M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
		<path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3" />
	`,
	rectangle: `
		<path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10" />
	`,
	arrow: `
		<path d="M17 7l-10 10" />
		<path d="M8 7l9 0l0 9" />
	`,
	crosshair: `
		<path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
		<path d="M4 16v2a2 2 0 0 0 2 2h2" />
		<path d="M16 4h2a2 2 0 0 1 2 2v2" />
		<path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
		<path d="M9 12l6 0" />
		<path d="M12 9l0 6" />
	`,
	message: `
		<path d="M8 9h8" />
		<path d="M8 13h6" />
		<path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12" />
	`,
	typography: `
		<path d="M4 20l3 0" />
		<path d="M14 20l7 0" />
		<path d="M6.9 15l6.9 0" />
		<path d="M10.2 6.3l5.8 13.7" />
		<path d="M5 20l6 -16l2 0l7 16" />
	`,
	trash: `
		<path d="M4 7l16 0" />
		<path d="M10 11l0 6" />
		<path d="M14 11l0 6" />
		<path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
		<path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
	`,
	fileExport: `
		<path d="M14 3v4a1 1 0 0 0 1 1h4" />
		<path d="M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3" />
	`,
};

const GROUPS = [
	{ id: "horizontal", label: "水平线" },
	{ id: "vertical", label: "垂直线" },
	{ id: "trend", label: "趋势线" },
	{ id: "analysis", label: "价格与分析" },
	{ id: "annotation", label: "标注" },
	{ id: "shape", label: "形状与文本" },
	{ id: "action", label: "操作" },
];

const TOOLS = [
	{
		type: "horizontalRayLine",
		name: "水平射线",
		english: "Horizontal ray",
		group: "horizontal",
		icon: "horizontalRay",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "从起点沿水平方向持续延伸，用于标记从某一时刻开始生效的价格位。",
		grammar: "起点 + 方向点 + 右侧贯穿",
	},
	{
		type: "horizontalSegment",
		name: "水平线段",
		english: "Horizontal segment",
		group: "horizontal",
		icon: "horizontalSegment",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "只连接两个时间点之间的水平价格区间，不延伸到图表边界。",
		grammar: "两个实心端点 + 有限水平连线",
	},
	{
		type: "horizontalStraightLine",
		name: "水平直线",
		english: "Horizontal straight line",
		group: "horizontal",
		icon: "horizontalStraight",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "横向贯穿整个图表的固定价格参考线。",
		grammar: "两个方向点 + 左右双向贯穿",
	},
	{
		type: "verticalRayLine",
		name: "垂直射线",
		english: "Vertical ray",
		group: "vertical",
		icon: "verticalRay",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "从时间锚点沿垂直方向延伸，用于强调某个事件时刻之后的纵向关系。",
		grammar: "起点 + 方向点 + 上方贯穿",
	},
	{
		type: "verticalSegment",
		name: "垂直线段",
		english: "Vertical segment",
		group: "vertical",
		icon: "verticalSegment",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "只存在于两个价格锚点之间的垂直测量线段。",
		grammar: "两个实心端点 + 有限垂直连线",
	},
	{
		type: "verticalStraightLine",
		name: "垂直直线",
		english: "Vertical straight line",
		group: "vertical",
		icon: "verticalStraight",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "纵向贯穿整个图表，用于标记单一时间节点。",
		grammar: "两个方向点 + 上下双向贯穿",
	},
	{
		type: "rayLine",
		name: "射线",
		english: "Ray",
		group: "trend",
		icon: "ray",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "由起点和方向点定义，并沿趋势方向无限延伸。",
		grammar: "起点 + 方向点 + 单向贯穿",
	},
	{
		type: "segment",
		name: "线段",
		english: "Segment",
		group: "trend",
		icon: "segment",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "连接两个锚点的有限趋势线，是最基础的两点绘图工具。",
		grammar: "两个实心端点 + 有限斜线",
	},
	{
		type: "straightLine",
		name: "直线",
		english: "Straight line",
		group: "trend",
		icon: "straight",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "穿过两个方向点并向两端无限延伸的趋势参考线。",
		grammar: "两个方向点 + 双向贯穿",
	},
	{
		type: "priceLine",
		name: "价格线",
		english: "Price line",
		group: "analysis",
		icon: "priceLine",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "将水平价格参考线与右侧价格标签绑定为一个整体。",
		grammar: "水平线 + 右侧价格标签",
	},
	{
		type: "priceChannelLine",
		name: "价格通道",
		english: "Price channel",
		group: "analysis",
		icon: "priceChannel",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "两条平行边界和一条中线共同表达趋势通道。",
		grammar: "双边界 + 虚线中轴",
	},
	{
		type: "parallelStraightLine",
		name: "平行直线",
		english: "Parallel straight lines",
		group: "analysis",
		icon: "parallelStraight",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "两条方向一致的无限直线，用于复制斜率和观察平行区间。",
		grammar: "两条贯穿直线 + 两个方向点",
	},
	{
		type: "fibonacciLine",
		name: "斐波那契线",
		english: "Fibonacci retracement",
		group: "analysis",
		icon: "fibonacci",
		source: "adapted",
		sourceName: "Tabler 规范扩展",
		description: "以多级水平比例线表达回撤和扩展位置。",
		grammar: "多级水平线 + 斜向量尺",
	},
	{
		type: "brush",
		name: "画笔",
		english: "Freehand brush",
		group: "annotation",
		icon: "brush",
		source: "tabler",
		sourceName: "Tabler · brush",
		description: "自由手绘路径，用于快速圈选、勾勒和非规则标记。",
		grammar: "笔锋 + 自由曲线",
	},
	{
		type: "simpleAnnotation",
		name: "简易标注",
		english: "Simple annotation",
		group: "annotation",
		icon: "pencil",
		source: "tabler",
		sourceName: "Tabler · pencil",
		description: "在单个锚点附近添加简短的说明文字。",
		grammar: "铅笔表示写入注释",
	},
	{
		type: "simpleTag",
		name: "简易标签",
		english: "Simple tag",
		group: "annotation",
		icon: "tag",
		source: "tabler",
		sourceName: "Tabler · tag",
		description: "以标签形态为行情位置附加简短分类或状态。",
		grammar: "吊牌轮廓 + 定位孔",
	},
	{
		type: "rectangle",
		name: "矩形",
		english: "Rectangle",
		group: "shape",
		icon: "rectangle",
		source: "tabler",
		sourceName: "Tabler · rectangle",
		description: "框选价格与时间共同构成的二维区域。",
		grammar: "闭合矩形轮廓",
	},
	{
		type: "arrow",
		name: "箭头",
		english: "Arrow",
		group: "shape",
		icon: "arrow",
		source: "tabler",
		sourceName: "Tabler · arrow-up-right",
		description: "用明确方向指向某一行情位置或趋势方向。",
		grammar: "斜向箭杆 + 开放箭头",
	},
	{
		type: "crossLine",
		name: "十字线",
		english: "Cross line",
		group: "shape",
		icon: "crosshair",
		source: "tabler",
		sourceName: "Tabler · crosshair",
		description: "用水平与垂直交点同时标记价格和时间。",
		grammar: "中央十字 + 四角取景框",
	},
	{
		type: "callout",
		name: "注释框",
		english: "Callout",
		group: "shape",
		icon: "message",
		source: "tabler",
		sourceName: "Tabler · message",
		description: "以带指向尾部的文本框强调较长说明。",
		grammar: "文本行 + 指向尾部",
	},
	{
		type: "text",
		name: "文本",
		english: "Text",
		group: "shape",
		icon: "typography",
		source: "tabler",
		sourceName: "Tabler · typography",
		description: "在图表任意位置放置独立文本。",
		grammar: "标准排版字符 A",
	},
	{
		type: "delete",
		name: "删除选中标注",
		english: "Delete selected overlay",
		group: "action",
		icon: "trash",
		source: "tabler",
		sourceName: "Tabler · trash",
		description: "删除当前已选中的、未锁定的图表标注。",
		grammar: "垃圾桶表示删除",
	},
	{
		type: "export",
		name: "导出场景",
		english: "Export scene",
		group: "action",
		icon: "fileExport",
		source: "tabler",
		sourceName: "Tabler · file-export",
		description: "将当前规范化场景导出为 JSON 文件。",
		grammar: "文件轮廓 + 向外箭头",
	},
];

const state = {
	selectedType: TOOLS[0].type,
	activeGroup: "all",
	query: "",
};

// 工具栏 Tooltip 使用 body 级浮层，避免被横向滚动容器裁剪。
const toolbarTooltip = document.querySelector("#toolbar-tooltip");
const toolbarTooltipName = document.querySelector("#toolbar-tooltip-name");
const toolbarTooltipType = document.querySelector("#toolbar-tooltip-type");
const chartStatus = document.querySelector(".chart-status");
let tooltipAnchor;

function iconSvg(iconName, label) {
	const accessibleAttributes = label === undefined
		? 'aria-hidden="true"'
		: `role="img" aria-label="${label}"`;
	return `
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			${accessibleAttributes}
		>
			${ICONS[iconName]}
		</svg>
	`;
}

function groupLabel(groupId) {
	return GROUPS.find((group) => group.id === groupId)?.label ?? "";
}

function positionToolbarTooltip(button) {
	const viewportPadding = 8;
	const tooltipGap = 8;
	const buttonRect = button.getBoundingClientRect();
	const toolbarRect = document.querySelector("#toolbar-preview").getBoundingClientRect();
	const tooltipRect = toolbarTooltip.getBoundingClientRect();
	const centeredLeft = buttonRect.left + (buttonRect.width - tooltipRect.width) / 2;
	const minimumLeft = Math.max(toolbarRect.left + viewportPadding, viewportPadding);
	const maximumLeft = Math.min(
		toolbarRect.right - tooltipRect.width - viewportPadding,
		window.innerWidth - tooltipRect.width - viewportPadding,
	);
	const left = Math.min(
		Math.max(centeredLeft, minimumLeft),
		maximumLeft,
	);

	toolbarTooltip.style.left = `${Math.round(left)}px`;
	toolbarTooltip.style.top = `${Math.round(buttonRect.bottom + tooltipGap)}px`;
}

function showToolbarTooltip(button, tool) {
	tooltipAnchor = button;
	toolbarTooltipName.textContent = tool.name;
	toolbarTooltipType.textContent = tool.type;
	toolbarTooltip.hidden = false;
	button.setAttribute("aria-describedby", "toolbar-tooltip");
	positionToolbarTooltip(button);
	toolbarTooltip.classList.add("is-visible");
	chartStatus.classList.add("is-tooltip-obscured");
}

function hideToolbarTooltip() {
	if (tooltipAnchor !== undefined) {
		tooltipAnchor.removeAttribute("aria-describedby");
	}
	toolbarTooltip.classList.remove("is-visible");
	toolbarTooltip.hidden = true;
	chartStatus.classList.remove("is-tooltip-obscured");
	tooltipAnchor = undefined;
}

function renderToolbar() {
	const toolbar = document.querySelector("#toolbar-preview");
	hideToolbarTooltip();
	toolbar.replaceChildren();

	for (const group of GROUPS) {
		const wrapper = document.createElement("div");
		wrapper.className = "toolbar-group";
		wrapper.setAttribute("aria-label", group.label);

		for (const tool of TOOLS.filter((candidate) => candidate.group === group.id)) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `tool-button${tool.type === state.selectedType ? " is-active" : ""}`;
			button.dataset.toolType = tool.type;
			button.dataset.tooltip = tool.name;
			button.setAttribute("aria-label", tool.name);
			button.setAttribute("aria-pressed", String(tool.type === state.selectedType));
			button.innerHTML = iconSvg(tool.icon);
			button.addEventListener("click", () => selectTool(tool.type));
			button.addEventListener("mouseenter", () => showToolbarTooltip(button, tool));
			button.addEventListener("mouseleave", () => {
				if (document.activeElement !== button) {
					hideToolbarTooltip();
				}
			});
			button.addEventListener("focus", () => showToolbarTooltip(button, tool));
			button.addEventListener("blur", hideToolbarTooltip);
			wrapper.append(button);
		}

		toolbar.append(wrapper);
	}

	const selectedTool = TOOLS.find((tool) => tool.type === state.selectedType);
	if (selectedTool !== undefined) {
		document.querySelector("#placement-selection").textContent =
			`已选择 · ${selectedTool.name} / ${selectedTool.type}`;
	}
}

function renderFilters() {
	const filterRoot = document.querySelector("#group-filters");
	filterRoot.replaceChildren();
	const options = [{ id: "all", label: "全部" }, ...GROUPS];

	for (const option of options) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `filter-button${option.id === state.activeGroup ? " is-active" : ""}`;
		button.textContent = option.label;
		button.setAttribute("aria-pressed", String(option.id === state.activeGroup));
		button.addEventListener("click", () => {
			state.activeGroup = option.id;
			renderFilters();
			renderMappingList();
		});
		filterRoot.append(button);
	}
}

function filteredTools() {
	const normalizedQuery = state.query.trim().toLocaleLowerCase("zh-CN");
	return TOOLS.filter((tool) => {
		const groupMatches = state.activeGroup === "all" || tool.group === state.activeGroup;
		const queryMatches = normalizedQuery.length === 0 || [
			tool.type,
			tool.name,
			tool.english,
			tool.description,
		].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
		return groupMatches && queryMatches;
	});
}

function renderMappingList() {
	const list = document.querySelector("#mapping-list");
	const emptyState = document.querySelector("#empty-state");
	const resultCount = document.querySelector("#result-count");
	const visibleTools = filteredTools();
	if (
		visibleTools.length > 0 &&
		!visibleTools.some((tool) => tool.type === state.selectedType)
	) {
		state.selectedType = visibleTools[0].type;
		renderToolbar();
		renderInspector();
	}
	list.replaceChildren();
	resultCount.textContent = `${visibleTools.length} / ${TOOLS.length}`;
	emptyState.hidden = visibleTools.length !== 0;

	for (const group of GROUPS) {
		const groupTools = visibleTools.filter((tool) => tool.group === group.id);
		if (groupTools.length === 0) {
			continue;
		}

		const heading = document.createElement("div");
		heading.className = "mapping-group-heading";
		heading.textContent = `${group.label} · ${groupTools.length}`;
		list.append(heading);

		for (const tool of groupTools) {
			const row = document.createElement("button");
			row.type = "button";
			row.className = `mapping-row${tool.type === state.selectedType ? " is-selected" : ""}`;
			row.dataset.toolType = tool.type;
			row.innerHTML = `
				<span class="mapping-icon">${iconSvg(tool.icon)}</span>
				<span class="mapping-name">
					<strong>${tool.name}</strong>
					<small>${tool.english}</small>
				</span>
				<code class="mapping-type">${tool.type}</code>
				<span class="mapping-meaning">${tool.grammar}</span>
				<span class="source-badge${tool.source === "adapted" ? " source-badge--adapted" : ""}">
					${tool.source === "adapted" ? "专业扩展" : "Tabler 原始"}
				</span>
			`;
			row.addEventListener("click", () => selectTool(tool.type));
			list.append(row);
		}
	}
}

function renderInspector() {
	const tool = TOOLS.find((candidate) => candidate.type === state.selectedType);
	if (tool === undefined) {
		return;
	}
	document.querySelector("#inspector-icon").innerHTML = iconSvg(tool.icon);
	document.querySelector("#inspector-group").textContent = groupLabel(tool.group);
	document.querySelector("#inspector-name").textContent = tool.name;
	document.querySelector("#inspector-type").textContent = tool.type;
	document.querySelector("#inspector-description").textContent = tool.description;
	document.querySelector("#inspector-grammar").textContent = tool.grammar;
	document.querySelector("#inspector-source").textContent = tool.sourceName;
}

function selectTool(type) {
	state.selectedType = type;
	renderToolbar();
	renderMappingList();
	renderInspector();
}

function renderGrammar() {
	document.querySelector("#grammar-segment").innerHTML = iconSvg("segment");
	document.querySelector("#grammar-ray").innerHTML = iconSvg("ray");
	document.querySelector("#grammar-straight").innerHTML = iconSvg("straight");
}

document.querySelector("#tool-search").addEventListener("input", (event) => {
	state.query = event.currentTarget.value;
	renderMappingList();
});

document.querySelector("#toolbar-preview").addEventListener("scroll", hideToolbarTooltip);
window.addEventListener("resize", hideToolbarTooltip);
window.addEventListener("scroll", hideToolbarTooltip, true);

renderToolbar();
renderFilters();
renderMappingList();
renderInspector();
renderGrammar();
