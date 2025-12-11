// 内联实现STLLoader，避免外部依赖
THREE.STLLoader = (function() {
    function STLLoader() {}
    
    STLLoader.prototype.parse = function(data) {
        var isBinary = function() {
            var expect, face_size, n_faces, reader;
            reader = new DataView(data);
            face_size = (32 / 8 * 3) + ((32 / 8 * 3) * 3) + (16 / 8);
            n_faces = reader.getUint32(80, true);
            expect = 80 + (32 / 8) + (n_faces * face_size);
            return expect === reader.byteLength;
        };
        
        var parseBinary = function(data) {
            var reader = new DataView(data);
            var faces = reader.getUint32(80, true);
            var r, g, b, hasColors = false, colors;
            var defaultR, defaultG, defaultB, alpha;
            
            // Check for default color in header
            for (var index = 0; index < 80 - 12; index++) {
                if (reader.getUint32(index, false) == 0x434F4C4F && reader.getUint8(index + 4) == 0x52 && reader.getUint8(index + 5) == 0x33) {
                    hasColors = true;
                    colors = [];
                    defaultR = reader.getUint8(index + 6) / 255;
                    defaultG = reader.getUint8(index + 7) / 255;
                    defaultB = reader.getUint8(index + 8) / 255;
                    alpha = reader.getUint8(index + 9) / 255;
                    break;
                }
            }
            
            var dataOffset = 84;
            var faceLength = 12 * 3 + 2;
            
            var geometry = new THREE.BufferGeometry();
            var vertices = [];
            var normals = [];
            var colorsArray = [];
            
            for (var face = 0; face < faces; face++) {
                var start = dataOffset + face * faceLength;
                var normalX = reader.getFloat32(start, true);
                var normalY = reader.getFloat32(start + 4, true);
                var normalZ = reader.getFloat32(start + 8, true);
                
                for (var i = 1; i <= 3; i++) {
                    var vertexstart = start + i * 12;
                    vertices.push(reader.getFloat32(vertexstart, true));
                    vertices.push(reader.getFloat32(vertexstart + 4, true));
                    vertices.push(reader.getFloat32(vertexstart + 8, true));
                    
                    normals.push(normalX, normalY, normalZ);
                }
                
                if (hasColors) {
                    var packedColor = reader.getUint16(start + 36, true);
                    
                    if ((packedColor & 0x8000) === 0) {
                        r = (packedColor & 0x1F) / 31;
                        g = ((packedColor >> 5) & 0x1F) / 31;
                        b = ((packedColor >> 10) & 0x1F) / 31;
                    } else {
                        r = defaultR;
                        g = defaultG;
                        b = defaultB;
                    }
                    
                    for (var j = 0; j < 3; j++) {
                        colorsArray.push(r, g, b);
                    }
                }
            }
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            
            if (hasColors) {
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsArray, 3));
            }
            
            return geometry;
        };
        
        var parseASCII = function(data) {
            var geometry = new THREE.BufferGeometry();
            var vertices = [];
            var normals = [];
            
            var patternFace = /facet([\s\S]*?)endfacet/g;
            var faceMatch;
            
            while ((faceMatch = patternFace.exec(data)) !== null) {
                var faceText = faceMatch[1];
                
                var normalMatch = /normal\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*/.exec(faceText);
                
                if (normalMatch !== null) {
                    var normalX = parseFloat(normalMatch[1]);
                    var normalY = parseFloat(normalMatch[2]);
                    var normalZ = parseFloat(normalMatch[3]);
                }
                
                var vertexPattern = /vertex\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*/g;
                var vertexMatch;
                
                while ((vertexMatch = vertexPattern.exec(faceText)) !== null) {
                    vertices.push(
                        parseFloat(vertexMatch[1]),
                        parseFloat(vertexMatch[2]),
                        parseFloat(vertexMatch[3])
                    );
                    
                    normals.push(normalX, normalY, normalZ);
                }
            }
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            
            return geometry;
        };
        
        return isBinary() ? parseBinary(data) : parseASCII(new TextDecoder().decode(data));
    };
    
    return STLLoader;
})();

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 3D场景变量
    let scene, camera, renderer, controls;
    let insoleGroup, footModel, stlFootModel;
    let isLayersVisible = true;
    let originalTemplate = null;
    let templateScale = 100;
    let templateOffsetX = 0;
    let templateOffsetY = 0;
    
    // 获取DOM元素
    const footForm = document.getElementById('footForm');
    const threeJsContainer = document.getElementById('threeJsContainer');
    const rotateLeftBtn = document.getElementById('rotateLeft');
    const rotateRightBtn = document.getElementById('rotateRight');
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const resetViewBtn = document.getElementById('resetView');
    const showLayersBtn = document.getElementById('showLayers');
    const designInfo = document.getElementById('designInfo');
    const stlFileInput = document.getElementById('stlFile');
    const loadStlBtn = document.getElementById('loadStlBtn');
    const templateFileInput = document.getElementById('templateFile');
    const templateScaleInput = document.getElementById('templateScale');
    const templateOffsetXInput = document.getElementById('templateOffsetX');
    const templateOffsetYInput = document.getElementById('templateOffsetY');
    const applyTemplateBtn = document.getElementById('applyTemplateBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const previewContainer = document.querySelector('.preview-container');
    const formOverlay = document.getElementById('formOverlay');
    const quickForm = document.getElementById('quickForm');
    const closeFormBtn = document.getElementById('closeFormBtn');
    const quickFootLength = document.getElementById('quickFootLength');
    const quickFootWidth = document.getElementById('quickFootWidth');
    const quickArchHeight = document.getElementById('quickArchHeight');
    const quickHeelWidth = document.getElementById('quickHeelWidth');
    const quickArchSupport = document.getElementById('quickArchSupport');
    
    // 足模控制元素
    const toggleFootControlsBtn = document.getElementById('toggleFootControlsBtn');
    const footModelControls = document.getElementById('footModelControls');
    const closeFootControls = document.getElementById('closeFootControls');
    const modelLength = document.getElementById('modelLength');
    const modelWidth = document.getElementById('modelWidth');
    const modelHeight = document.getElementById('modelHeight');
    
    // 移动控制元素
    const moveX = document.getElementById('moveX');
    const moveY = document.getElementById('moveY');
    const moveZ = document.getElementById('moveZ');
    const resetX = document.getElementById('resetX');
    const resetY = document.getElementById('resetY');
    const resetZ = document.getElementById('resetZ');
    const resetPosition = document.getElementById('resetPosition');
    
    // 旋转控制元素
    const rotateX = document.getElementById('rotateX');
    const rotateY = document.getElementById('rotateY');
    const rotateZ = document.getElementById('rotateZ');
    const resetRotX = document.getElementById('resetRotX');
    const resetRotY = document.getElementById('resetRotY');
    const resetRotZ = document.getElementById('resetRotZ');
    const resetRotation = document.getElementById('resetRotation');
    
    // 缩放控制元素
    const scale = document.getElementById('scale');
    const resetScale = document.getElementById('resetScale');
    const matchFormSize = document.getElementById('matchFormSize');
    
    // 初始化3D场景
    function initThreeJS() {
        // 创建场景
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xfafafa);
        
        // 创建相机
        camera = new THREE.PerspectiveCamera(
            75,
            threeJsContainer.clientWidth / threeJsContainer.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 5, 15);
        camera.lookAt(0, 0, 0);
        
        // 创建渲染器
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(threeJsContainer.clientWidth, threeJsContainer.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        threeJsContainer.appendChild(renderer.domElement);
        
        // 添加光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        scene.add(directionalLight);
        
        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(-5, 5, -5);
        scene.add(pointLight);
        
        // 添加辅助网格
        const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee);
        scene.add(gridHelper);
        
        // 添加坐标系
        const axesHelper = new THREE.AxesHelper(5);
        scene.add(axesHelper);
        
        // 初始化鞋垫组
        insoleGroup = new THREE.Group();
        scene.add(insoleGroup);
        
        // 初始创建一个简单的鞋垫模型
        createInsoleModel();
        
        // 添加动画循环
        animate();
        
        // 处理窗口大小变化
        window.addEventListener('resize', onWindowResize);
        
        // 添加鼠标交互
        addMouseInteraction();
        
        // 添加事件监听器
        addEventListeners();
    }
    
    // 添加事件监听器
    function addEventListeners() {
        // STL文件加载按钮事件
        loadStlBtn.addEventListener('click', loadSTLModel);
        
        // 原装鞋垫模板应用按钮事件
        applyTemplateBtn.addEventListener('click', applyTemplateAdjustments);
        
        // 模板参数变化事件
        templateScaleInput.addEventListener('change', function() {
            templateScale = parseFloat(this.value);
        });
        
        templateOffsetXInput.addEventListener('change', function() {
            templateOffsetX = parseFloat(this.value);
        });
        
        templateOffsetYInput.addEventListener('change', function() {
            templateOffsetY = parseFloat(this.value);
        });
        
        // 模板文件上传事件
        templateFileInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                loadOriginalTemplate(e.target.files[0]);
            }
        });
        
        // 全屏按钮事件
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        
        // 关闭表单按钮事件
        closeFormBtn.addEventListener('click', function() {
            formOverlay.classList.remove('active');
        });
        
        // 快速表单提交事件
        quickForm.addEventListener('submit', function(e) {
            e.preventDefault();
            updateInsoleFromQuickForm();
        });
        
        // 监听表单输入变化，同步到快速表单
        document.getElementById('footLength').addEventListener('input', updateQuickForm);
        document.getElementById('footWidth').addEventListener('input', updateQuickForm);
        document.getElementById('archHeight').addEventListener('input', updateQuickForm);
        document.getElementById('heelWidth').addEventListener('input', updateQuickForm);
        document.getElementById('archSupport').addEventListener('input', updateQuickForm);
        
        // 初始化快速表单数据
        updateQuickForm();
        
        // 足模控制事件监听器
        addFootModelControls();
    }
    
    // 添加足模控制事件监听器
    function addFootModelControls() {
        // 切换足模控制界面
        toggleFootControlsBtn.addEventListener('click', function() {
            footModelControls.classList.toggle('active');
        });
        
        // 关闭足模控制界面
        closeFootControls.addEventListener('click', function() {
            footModelControls.classList.remove('active');
        });
        
        // 移动控制事件
        moveX.addEventListener('input', function() {
            updateFootModelPosition();
        });
        moveY.addEventListener('input', function() {
            updateFootModelPosition();
        });
        moveZ.addEventListener('input', function() {
            updateFootModelPosition();
        });
        
        // 旋转控制事件
        rotateX.addEventListener('input', function() {
            updateFootModelRotation();
        });
        rotateY.addEventListener('input', function() {
            updateFootModelRotation();
        });
        rotateZ.addEventListener('input', function() {
            updateFootModelRotation();
        });
        
        // 缩放控制事件
        scale.addEventListener('input', function() {
            updateFootModelScale();
        });
        
        // 重置控制事件
        resetX.addEventListener('click', function() {
            moveX.value = 0;
            updateFootModelPosition();
        });
        resetY.addEventListener('click', function() {
            moveY.value = 0;
            updateFootModelPosition();
        });
        resetZ.addEventListener('click', function() {
            moveZ.value = 0;
            updateFootModelPosition();
        });
        resetPosition.addEventListener('click', function() {
            resetFootModelPosition();
        });
        
        resetRotX.addEventListener('click', function() {
            rotateX.value = 0;
            updateFootModelRotation();
        });
        resetRotY.addEventListener('click', function() {
            rotateY.value = 0;
            updateFootModelRotation();
        });
        resetRotZ.addEventListener('click', function() {
            rotateZ.value = 0;
            updateFootModelRotation();
        });
        resetRotation.addEventListener('click', function() {
            resetFootModelRotation();
        });
        
        resetScale.addEventListener('click', function() {
            scale.value = 1;
            updateFootModelScale();
        });
        
        // 匹配表单尺寸事件
        matchFormSize.addEventListener('click', function() {
            matchFootModelToFormSize();
        });
        
        // 初始化足模控制
        initFootModelControls();
    }
    
    // 初始化足模控制
    function initFootModelControls() {
        // 定期更新足模尺寸显示
        setInterval(updateFootModelDimensions, 500);
    }
    
    // 更新足模位置
    function updateFootModelPosition() {
        // 同时支持STL足模和默认足模
        const targetModel = stlFootModel || footModel;
        if (!targetModel) return;
        
        const x = parseFloat(moveX.value) || 0;
        const y = parseFloat(moveY.value) || 0;
        const z = parseFloat(moveZ.value) || 0;
        
        targetModel.position.set(x, y, z);
        renderer.render(scene, camera);
    }
    
    // 更新足模旋转
    function updateFootModelRotation() {
        // 同时支持STL足模和默认足模
        const targetModel = stlFootModel || footModel;
        if (!targetModel) return;
        
        const x = parseFloat(rotateX.value) || 0;
        const y = parseFloat(rotateY.value) || 0;
        const z = parseFloat(rotateZ.value) || 0;
        
        console.log('Updating foot model rotation - X:', x, 'Y:', y, 'Z:', z);
        
        // 转换为弧度
        targetModel.rotation.set(
            x * Math.PI / 180,
            y * Math.PI / 180,
            z * Math.PI / 180
        );
        
        renderer.render(scene, camera);
        
        // 更新足模尺寸显示
        updateFootModelDimensions();
    }
    
    // 更新足模缩放
    function updateFootModelScale() {
        // 同时支持STL足模和默认足模
        const targetModel = stlFootModel || footModel;
        if (!targetModel) return;
        
        const scaleValue = parseFloat(scale.value) || 1;
        targetModel.scale.set(scaleValue, scaleValue, scaleValue);
        renderer.render(scene, camera);
        updateFootModelDimensions(); // 更新尺寸显示
    }
    
    // 重置足模位置
    function resetFootModelPosition() {
        // 同时支持STL足模和默认足模
        const targetModel = stlFootModel || footModel;
        if (!targetModel) return;
        
        moveX.value = 0;
        moveY.value = 0;
        moveZ.value = 0;
        updateFootModelPosition();
    }
    
    // 重置足模旋转
    function resetFootModelRotation() {
        // 同时支持STL足模和默认足模
        const targetModel = stlFootModel || footModel;
        if (!targetModel) return;
        
        rotateX.value = 0;
        rotateY.value = 0;
        rotateZ.value = 0;
        updateFootModelRotation();
    }
    
    // 更新足模尺寸显示
    function updateFootModelDimensions() {
        // 同时支持STL足模和默认足模
        const targetModel = stlFootModel || footModel;
        if (!targetModel) {
            modelLength.textContent = '0';
            modelWidth.textContent = '0';
            modelHeight.textContent = '0';
            return;
        }
        
        // 计算足模边界盒
        const box = new THREE.Box3().setFromObject(targetModel);
        const size = box.getSize(new THREE.Vector3());
        
        // 转换为毫米
        const length = size.z * 100;
        const width = size.x * 100;
        const height = size.y * 100;
        
        // 更新显示
        modelLength.textContent = Math.round(length);
        modelWidth.textContent = Math.round(width);
        modelHeight.textContent = Math.round(height);
    }
    
    // 匹配足模尺寸到表单数据
    function matchFootModelToFormSize() {
        // 同时支持STL足模和默认足模
        const targetModel = stlFootModel || footModel;
        if (!targetModel) return;
        
        // 获取表单尺寸数据（毫米）
        const formLength = parseFloat(document.getElementById('footLength').value) || 250;
        const formWidth = parseFloat(document.getElementById('footWidth').value) || 100;
        
        // 计算当前足模尺寸（毫米）
        const box = new THREE.Box3().setFromObject(targetModel);
        const size = box.getSize(new THREE.Vector3());
        const currentLength = size.z * 100;
        const currentWidth = size.x * 100;
        
        // 计算缩放比例
        const scaleX = formWidth / currentWidth;
        const scaleZ = formLength / currentLength;
        const avgScale = (scaleX + scaleZ) / 2; // 使用平均比例
        
        // 应用缩放
        targetModel.scale.set(avgScale, avgScale, avgScale);
        scale.value = avgScale;
        
        // 更新显示
        updateFootModelDimensions();
        renderer.render(scene, camera);
        
        console.log('Foot model scaled to match form size, scale:', avgScale);
    }
    
    // 切换全屏模式
    function toggleFullscreen() {
        const isFullscreen = previewContainer.classList.contains('fullscreen');
        
        if (isFullscreen) {
            // 退出全屏
            previewContainer.classList.remove('fullscreen');
            fullscreenBtn.textContent = '全屏查看';
            formOverlay.classList.remove('active');
            
            // 恢复页面滚动
            document.body.style.overflow = 'auto';
            
            // 恢复相机位置
            camera.position.set(0, 5, 15);
            camera.lookAt(0, 0, 0);
        } else {
            // 进入全屏
            previewContainer.classList.add('fullscreen');
            fullscreenBtn.textContent = '退出全屏';
            
            // 锁定页面滚动
            document.body.style.overflow = 'hidden';
            
            // 调整相机位置
            camera.position.set(0, 8, 20);
            camera.lookAt(0, 0, 0);
            
            // 显示快速表单
            formOverlay.classList.add('active');
        }
        
        // 更新渲染尺寸
        onWindowResize();
        
        // 强制重新渲染
        renderer.render(scene, camera);
    }
    
    // 更新快速表单数据
    function updateQuickForm() {
        const footLength = document.getElementById('footLength').value;
        const footWidth = document.getElementById('footWidth').value;
        const archHeight = document.getElementById('archHeight').value;
        const heelWidth = document.getElementById('heelWidth').value;
        const archSupport = document.getElementById('archSupport').value;
        
        quickFootLength.value = footLength;
        quickFootWidth.value = footWidth;
        quickArchHeight.value = archHeight;
        quickHeelWidth.value = heelWidth;
        quickArchSupport.value = archSupport;
    }
    
    // 从快速表单更新鞋垫设计
    function updateInsoleFromQuickForm() {
        // 获取快速表单数据
        const footLength = parseFloat(quickFootLength.value);
        const footWidth = parseFloat(quickFootWidth.value);
        const archHeight = parseFloat(quickArchHeight.value);
        const heelWidth = parseFloat(quickHeelWidth.value);
        const archSupport = quickArchSupport.value;
        
        // 更新主表单数据
        document.getElementById('footLength').value = footLength;
        document.getElementById('footWidth').value = footWidth;
        document.getElementById('archHeight').value = archHeight;
        document.getElementById('heelWidth').value = heelWidth;
        document.getElementById('archSupport').value = archSupport;
        
        // 重新生成鞋垫模型
        const params = getCurrentFormParams();
        createInsoleModel(params);
        
        // 强制重新渲染
        renderer.render(scene, camera);
        
        console.log('Insole design updated from quick form');
    }
    
    // 加载STL格式足底模型
    function loadSTLModel() {
        const file = stlFileInput.files[0];
        if (!file) {
            alert('请先选择STL文件');
            return;
        }
        
        // 检查文件类型
        if (file.type !== 'application/sla' && !file.name.toLowerCase().endsWith('.stl')) {
            alert('请选择有效的STL文件');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const arrayBuffer = event.target.result;
                
                console.log('STL file loaded, size:', arrayBuffer.byteLength, 'bytes');
                
                // 使用STLLoader加载模型
                let geometry;
                if (typeof THREE.STLLoader !== 'undefined') {
                    // 直接使用全局STLLoader
                    const loader = new THREE.STLLoader();
                    geometry = loader.parse(arrayBuffer);
                } else {
                    alert('STLLoader未正确加载，请检查Three.js版本');
                    console.error('THREE.STLLoader is undefined');
                    return;
                }
                
                console.log('STL geometry parsed successfully, vertices:', geometry.attributes.position.count / 3);
                
                // 创建材质
                const material = new THREE.MeshStandardMaterial({
                    color: 0xf5d76e,
                    transparent: true,
                    opacity: 0.7,
                    metalness: 0.1,
                    roughness: 0.8
                });
                
                // 移除旧的STL模型
                if (stlFootModel) {
                    insoleGroup.remove(stlFootModel);
                    stlFootModel = null;
                }
                
                // 创建新的STL模型
                stlFootModel = new THREE.Mesh(geometry, material);
                stlFootModel.name = 'stlFootModel';
                stlFootModel.castShadow = true;
                stlFootModel.receiveShadow = true;
                
                // 调整模型位置和缩放
                adjustSTLModelPosition(stlFootModel);
                
                // 添加到鞋垫组，确保与鞋垫在同一坐标系下
                insoleGroup.add(stlFootModel);
                
                console.log('STL model added to insoleGroup successfully');
                console.log('InsoleGroup children count:', insoleGroup.children.length);
                console.log('Model visibility:', stlFootModel.visible);
                
                // 更新设计信息
                designInfo.innerHTML += '<p><strong>足底模型:</strong> 已成功加载</p>';
                
                // 调整相机位置，确保模型可见
                camera.position.set(0, 8, 20);
                camera.lookAt(0, 0, 0);
                console.log('Camera position updated to ensure model visibility');
                
                // 强制重新渲染
                renderer.render(scene, camera);
                console.log('Forced scene re-render');
                
                // 根据STL模型调整鞋垫设计
                if (stlFootModel) {
                    adjustInsoleToFootModel(stlFootModel);
                }
            } catch (error) {
                console.error('Error processing STL file:', error);
                alert('处理STL文件时发生错误: ' + error.message);
            }
        };
        
        reader.onerror = function(event) {
            console.error('Error reading STL file:', event.target.error);
            alert('读取STL文件失败，请检查文件完整性');
        };
        
        reader.onprogress = function(event) {
            if (event.lengthComputable) {
                const percentLoaded = (event.loaded / event.total) * 100;
                console.log('Loading STL file:', percentLoaded.toFixed(1) + '%');
            }
        };
        
        console.log('Starting to read STL file:', file.name);
        reader.readAsArrayBuffer(file);
    }
    
    // 调整STL模型位置和缩放
    function adjustSTLModelPosition(model) {
        try {
            console.log('Adjusting STL model position and scale');
            
            // 重置模型变换
            model.position.set(0, 0, 0);
            model.rotation.set(0, 0, 0);
            model.scale.set(1, 1, 1);
            
            // 计算模型边界盒
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            console.log('Original model size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));
            console.log('Original model center:', center.x.toFixed(3), center.y.toFixed(3), center.z.toFixed(3));
            
            // 验证模型是否为三维模型
            const is3DModel = size.x > 0 && size.y > 0 && size.z > 0;
            console.log('Is 3D model:', is3DModel);
            
            if (!is3DModel) {
                console.warn('Model appears to be flat, attempting to fix orientation');
            }
            
            // 根据模型尺寸和鞋垫尺寸计算合适的缩放因子
            // 获取当前表单中的足部长度（毫米）
            const footLengthInput = document.getElementById('footLength');
            const targetFootLength = footLengthInput ? parseFloat(footLengthInput.value) : 250; // 默认250mm
            
            // 确定模型的长轴方向
            let majorAxis = 0; // 0: x, 1: y, 2: z
            let modelLength = size.x;
            
            if (size.y > modelLength) {
                modelLength = size.y;
                majorAxis = 1;
            }
            if (size.z > modelLength) {
                modelLength = size.z;
                majorAxis = 2;
            }
            
            console.log('Model major axis:', ['x', 'y', 'z'][majorAxis], 'with length:', modelLength.toFixed(3));
            
            // 计算缩放因子：目标长度（米）/ 模型长轴长度
            const targetLengthMeters = targetFootLength / 1000; // 转换为米
            const scaleFactor = targetLengthMeters / modelLength;
            
            // 确保缩放因子在合理范围内，避免模型过大或过小
            const minScale = 0.1;
            const maxScale = 10;
            const finalScaleFactor = Math.max(minScale, Math.min(maxScale, scaleFactor));
            
            model.scale.set(finalScaleFactor, finalScaleFactor, finalScaleFactor);
            console.log('Scale factor calculated:', scaleFactor, 'final:', finalScaleFactor);
            console.log('Target foot length:', targetFootLength, 'mm');
            
            // 重新计算边界盒
            const newBox = new THREE.Box3().setFromObject(model);
            const newSize = newBox.getSize(new THREE.Vector3());
            const newCenter = newBox.getCenter(new THREE.Vector3());
            
            console.log('After scaling - size:', newSize.x.toFixed(3), newSize.y.toFixed(3), newSize.z.toFixed(3));
            console.log('After scaling - center:', newCenter.x.toFixed(3), newCenter.y.toFixed(3), newCenter.z.toFixed(3));
            
            // 调整模型位置，使其与鞋垫在同一坐标系下精确对齐
            // 计算模型底部位置
            const bottomY = newBox.min.y;
            
            // 调整模型位置，使底部与鞋垫顶部对齐
            // 获取当前鞋垫总高度（米）
            const baseThickness = parseFloat(document.getElementById('baseThickness').value) || 5;
            const supportThickness = parseFloat(document.getElementById('supportThickness').value) || 1;
            const cushionThickness = parseFloat(document.getElementById('cushionThickness').value) || 3;
            const totalInsoleHeight = (baseThickness + supportThickness + cushionThickness) / 1000; // 转换为米
            
            model.position.y = totalInsoleHeight - bottomY;
            model.position.x = -newCenter.x;
            model.position.z = -newCenter.z;
            
            // 改进旋转逻辑，确保模型正确显示三维形状
            // 根据长轴方向调整旋转
            if (majorAxis === 0) { // 长轴为x轴
                model.rotation.y = Math.PI / 2; // 绕y轴旋转90度
            } else if (majorAxis === 1) { // 长轴为y轴
                model.rotation.x = -Math.PI / 2; // 绕x轴旋转-90度
            } else { // 长轴为z轴
                // 无需旋转，保持原样
            }
            
            // 添加微调，确保模型正确朝向
            model.rotation.z = 0;
            
            console.log('Final model position:', model.position.x.toFixed(3), model.position.y.toFixed(3), model.position.z.toFixed(3));
            console.log('Final model rotation:', model.rotation.x.toFixed(3), model.rotation.y.toFixed(3), model.rotation.z.toFixed(3));
            console.log('Model added to insoleGroup, visible:', model.visible, 'castShadow:', model.castShadow, 'receiveShadow:', model.receiveShadow);
            console.log('Total insole height:', totalInsoleHeight, 'meters');
            
            // 确保模型可见
            model.visible = true;
            
            // 再次验证模型尺寸，确保其为三维
            const finalBox = new THREE.Box3().setFromObject(model);
            const finalSize = finalBox.getSize(new THREE.Vector3());
            console.log('Final model dimensions:', finalSize.x.toFixed(3), finalSize.y.toFixed(3), finalSize.z.toFixed(3));
            
        } catch (error) {
            console.error('Error adjusting STL model:', error);
            alert('调整模型位置时发生错误: ' + error.message);
        }
    }
    
    // 根据STL模型调整鞋垫设计
    function adjustInsoleToFootModel(footModel) {
        try {
            console.log('Adjusting insole design based on foot model');
            
            // 计算模型边界盒
            const box = new THREE.Box3().setFromObject(footModel);
            const size = box.getSize(new THREE.Vector3());
            
            console.log('Foot model size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));
            
            // 调整鞋垫尺寸以匹配足底模型
            const footLength = size.z * 100; // 转换为毫米
            const footWidth = size.x * 100;
            const heelWidth = (size.x * 0.7) * 100; // 估算足跟宽度
            
            console.log('Calculated foot dimensions - length:', footLength.toFixed(1), 'mm, width:', footWidth.toFixed(1), 'mm');
            
            // 更新表单中的测量数据
            const footLengthInput = document.getElementById('footLength');
            const footWidthInput = document.getElementById('footWidth');
            const heelWidthInput = document.getElementById('heelWidth');
            
            if (footLengthInput && footWidthInput && heelWidthInput) {
                footLengthInput.value = Math.round(footLength);
                footWidthInput.value = Math.round(footWidth);
                heelWidthInput.value = Math.round(heelWidth);
                console.log('Updated form with new foot dimensions');
            } else {
                console.error('One or more form inputs not found');
            }
            
            // 重新生成鞋垫模型
            const params = getCurrentFormParams();
            createInsoleModel(params);
            
            // 更新设计信息
            designInfo.innerHTML += `<p><strong>自动调整:</strong> 鞋垫尺寸已根据足底模型调整</p>`;
            console.log('Insole adjustment completed successfully');
        } catch (error) {
            console.error('Error adjusting insole to foot model:', error);
            alert('根据足底模型调整鞋垫时发生错误: ' + error.message);
        }
    }
    
    // 加载原装鞋垫模板
    function loadOriginalTemplate(file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            originalTemplate = event.target.result;
            alert('原装鞋垫模板已加载，可调整参数后应用');
        };
        reader.readAsDataURL(file);
    }
    
    // 应用模板调整
    function applyTemplateAdjustments() {
        templateScale = parseFloat(templateScaleInput.value);
        templateOffsetX = parseFloat(templateOffsetXInput.value);
        templateOffsetY = parseFloat(templateOffsetYInput.value);
        
        // 更新当前设计参数
        const params = getCurrentFormParams();
        
        // 应用模板调整到鞋垫设计
        adjustInsoleByTemplate(params, templateScale, templateOffsetX, templateOffsetY);
        
        // 重新生成鞋垫模型
        createInsoleModel(params);
        
        // 更新设计信息
        designInfo.innerHTML += `<p><strong>模板调整:</strong> 已应用，缩放: ${templateScale}%, 偏移: X=${templateOffsetX}mm, Y=${templateOffsetY}mm</p>`;
    }
    
    // 根据模板调整鞋垫
    function adjustInsoleByTemplate(params, scale, offsetX, offsetY) {
        // 应用缩放调整
        const scaleFactor = scale / 100;
        params.footLength = Math.round(params.footLength * scaleFactor);
        params.footWidth = Math.round(params.footWidth * scaleFactor);
        params.heelWidth = Math.round(params.heelWidth * scaleFactor);
        
        // 应用偏移调整（这里简化处理，实际应用中可能需要更复杂的算法）
        // 偏移值会影响鞋垫的形状和位置
        
        // 更新表单数据
        document.getElementById('footLength').value = params.footLength;
        document.getElementById('footWidth').value = params.footWidth;
        document.getElementById('heelWidth').value = params.heelWidth;
    }
    
    // 获取当前表单参数
    function getCurrentFormParams() {
        const formData = new FormData(footForm);
        return {
            footLength: parseFloat(formData.get('footLength')),
            footWidth: parseFloat(formData.get('footWidth')),
            archHeight: parseFloat(formData.get('archHeight')),
            heelWidth: parseFloat(formData.get('heelWidth')),
            archType: formData.get('archType'),
            footConditions: Array.from(formData.getAll('footCondition')),
            baseLayer: formData.get('baseLayer'),
            baseThickness: parseFloat(formData.get('baseThickness')),
            supportLayer: formData.get('supportLayer'),
            supportThickness: parseFloat(formData.get('supportThickness')),
            cushionLayer: formData.get('cushionLayer'),
            cushionThickness: parseFloat(formData.get('cushionThickness')),
            archSupport: formData.get('archSupport'),
            heelCup: parseFloat(formData.get('heelCup')),
            metatarsalPad: parseFloat(formData.get('metatarsalPad')),
            heelWedges: parseFloat(formData.get('heelWedges')),
            shoeType: formData.get('shoeType')
        };
    }
    
    // 窗口大小变化处理
    function onWindowResize() {
        camera.aspect = threeJsContainer.clientWidth / threeJsContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(threeJsContainer.clientWidth, threeJsContainer.clientHeight);
    }
    
    // 鼠标交互
    function addMouseInteraction() {
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let currentMode = 'rotate'; // rotate, move, scale
        let isLeftMouse = false;
        let isRightMouse = false;
        
        // 获取鼠标在屏幕上的位置（归一化设备坐标）
        function getMousePosition(event) {
            const rect = threeJsContainer.getBoundingClientRect();
            return new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
        }
        
        // 检测鼠标是否点击在模型上
        function isMouseOverModel(event) {
            const mouse = getMousePosition(event);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            
            // 检测insoleGroup及其所有子模型
            const intersects = raycaster.intersectObject(insoleGroup, true);
            
            return intersects.length > 0;
        }
        
        threeJsContainer.addEventListener('mousedown', (e) => {
            if (!isMouseOverModel(e)) return;
            
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
            
            if (e.button === 0) { // 左键
                isLeftMouse = true;
                currentMode = 'rotate';
            } else if (e.button === 2) { // 右键
                isRightMouse = true;
                currentMode = 'move';
            }
        });
        
        threeJsContainer.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaMove = {
                x: e.clientX - previousMousePosition.x,
                y: e.clientY - previousMousePosition.y
            };
            
            // 获取当前要操作的模型
            const targetModel = stlFootModel || insoleGroup;
            
            if (currentMode === 'rotate') {
                // 旋转模型
                targetModel.rotation.y += deltaMove.x * 0.01;
                targetModel.rotation.x += deltaMove.y * 0.01;
            } else if (currentMode === 'move') {
                // 移动模型
                const moveSpeed = 0.05;
                targetModel.position.x += deltaMove.x * moveSpeed * 0.1;
                targetModel.position.y -= deltaMove.y * moveSpeed * 0.1;
            }
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        threeJsContainer.addEventListener('mouseup', () => {
            isDragging = false;
            isLeftMouse = false;
            isRightMouse = false;
        });
        
        threeJsContainer.addEventListener('mouseleave', () => {
            isDragging = false;
            isLeftMouse = false;
            isRightMouse = false;
        });
        
        // 鼠标滚轮缩放
        threeJsContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // 获取当前要操作的模型 - 优先缩放足模
            const targetModel = stlFootModel || footModel || insoleGroup;
            
            const scaleSpeed = 0.05;
            const scaleFactor = e.deltaY > 0 ? (1 - scaleSpeed) : (1 + scaleSpeed);
            
            targetModel.scale.multiplyScalar(scaleFactor);
            
            // 更新缩放控制滑块
            if (stlFootModel || footModel) {
                scale.value = targetModel.scale.x;
            }
        });
        
        // 禁用右键菜单
        threeJsContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // 添加模型选择功能
        threeJsContainer.addEventListener('click', (e) => {
            const mouse = getMousePosition(e);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            
            // 检查是否点击了足模
            if (stlFootModel) {
                const footIntersects = raycaster.intersectObjects([stlFootModel]);
                if (footIntersects.length > 0) {
                    // 高亮足模
                    stlFootModel.material.opacity = 0.9;
                    return;
                }
            }
            
            // 检查是否点击了鞋垫组
            const insoleIntersects = raycaster.intersectObjects([insoleGroup]);
            if (insoleIntersects.length > 0) {
                // 恢复足模透明度
                if (stlFootModel) {
                    stlFootModel.material.opacity = 0.7;
                }
                return;
            }
        });
    }
    
    // 创建鞋垫模型
    function createInsoleModel(params = {}) {
        // 默认参数
        const defaultParams = {
            footLength: 250,
            footWidth: 100,
            archHeight: 25,
            heelWidth: 70,
            archType: 'normal',
            archSupport: 'medium',
            baseThickness: 5,
            supportThickness: 1,
            cushionThickness: 3,
            heelCup: 10,
            metatarsalPad: 3,
            heelWedges: 0
        };
        
        const mergedParams = { ...defaultParams, ...params };
        
        // 清除现有模型
        while (insoleGroup.children.length > 0) {
            insoleGroup.remove(insoleGroup.children[0]);
        }
        
        // 创建多层鞋垫结构
        createBaseLayer(mergedParams);
        createSupportLayer(mergedParams);
        createCushionLayer(mergedParams);
        createMeshSupportStructure(mergedParams);
        createFunctionalElements(mergedParams);
        
        // 创建足部模型（可选）
        createFootModel(mergedParams);
    }
    
    // 创建基层
    function createBaseLayer(params) {
        const length = params.footLength / 100; // 转换为米
        const width = params.footWidth / 100;
        const thickness = params.baseThickness / 100;
        
        // 创建鞋垫轮廓
        const insoleShape = createInsoleShape(params);
        
        // 创建带有曲面的拉伸几何体
        const baseGeometry = new THREE.ExtrudeGeometry(insoleShape, {
            depth: thickness,
            bevelEnabled: true,
            bevelThickness: 0.003,
            bevelSize: 0.003,
            bevelSegments: 5,
            curveSegments: 20
        });
        
        // 应用足部曲面变形
        applyFootCurvature(baseGeometry, params);
        
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: 0.8,
            metalness: 0.1,
            roughness: 0.7,
            side: THREE.DoubleSide
        });
        
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        baseMesh.position.y = thickness / 2;
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        baseMesh.name = 'baseLayer';
        insoleGroup.add(baseMesh);
    }
    
    // 创建支撑层
    function createSupportLayer(params) {
        const length = params.footLength / 100;
        const width = params.footWidth / 100;
        const thickness = params.supportThickness / 100;
        const baseThickness = params.baseThickness / 100;
        
        // 创建支撑层形状（略小于基层）
        const supportShape = createInsoleShape(params, 0.015);
        
        // 创建带有不同厚度的支撑层几何体
        const supportGeometry = new THREE.ExtrudeGeometry(supportShape, {
            depth: thickness,
            bevelEnabled: true,
            bevelThickness: 0.002,
            bevelSize: 0.002,
            bevelSegments: 3,
            curveSegments: 20
        });
        
        // 应用足弓支撑变形
        applyArchSupportDeformation(supportGeometry, params);
        
        const supportMaterial = new THREE.MeshStandardMaterial({
            color: 0xe74c3c,
            transparent: true,
            opacity: 0.8,
            metalness: 0.3,
            roughness: 0.5,
            side: THREE.DoubleSide
        });
        
        const supportMesh = new THREE.Mesh(supportGeometry, supportMaterial);
        supportMesh.position.y = baseThickness + thickness / 2;
        supportMesh.castShadow = true;
        supportMesh.receiveShadow = true;
        supportMesh.name = 'supportLayer';
        insoleGroup.add(supportMesh);
    }
    
    // 创建缓冲层
    function createCushionLayer(params) {
        const length = params.footLength / 100;
        const width = params.footWidth / 100;
        const thickness = params.cushionThickness / 100;
        const baseThickness = params.baseThickness / 100;
        const supportThickness = params.supportThickness / 100;
        
        // 创建缓冲层形状（略小于支撑层）
        const cushionShape = createInsoleShape(params, 0.03);
        
        // 创建带有曲面的缓冲层几何体
        const cushionGeometry = new THREE.ExtrudeGeometry(cushionShape, {
            depth: thickness,
            bevelEnabled: true,
            bevelThickness: 0.002,
            bevelSize: 0.002,
            bevelSegments: 3,
            curveSegments: 20
        });
        
        // 应用缓冲层曲面变形
        applyCushionCurvature(cushionGeometry, params);
        
        const cushionMaterial = new THREE.MeshStandardMaterial({
            color: 0x27ae60,
            transparent: true,
            opacity: 0.8,
            metalness: 0,
            roughness: 0.9,
            side: THREE.DoubleSide
        });
        
        const cushionMesh = new THREE.Mesh(cushionGeometry, cushionMaterial);
        cushionMesh.position.y = baseThickness + supportThickness + thickness / 2;
        cushionMesh.castShadow = true;
        cushionMesh.receiveShadow = true;
        cushionMesh.name = 'cushionLayer';
        insoleGroup.add(cushionMesh);
    }
    
    // 应用足部曲面变形
    function applyFootCurvature(geometry, params) {
        const vertices = geometry.attributes.position.array;
        const length = params.footLength / 100;
        const width = params.footWidth / 100;
        const archHeight = params.archHeight / 1000; // 缩小影响范围
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];
            
            // 横向曲率（足弓方向）
            if (Math.abs(x) < length / 3) {
                const curve = Math.cos((x / (length / 3)) * Math.PI / 2);
                vertices[i + 2] += curve * archHeight * 2;
            }
            
            // 纵向曲率（前后方向）
            const lengthCurve = Math.sin((x + length / 2) / length * Math.PI);
            vertices[i + 2] += lengthCurve * archHeight;
        }
        
        geometry.computeVertexNormals();
    }
    
    // 应用足弓支撑变形
    function applyArchSupportDeformation(geometry, params) {
        const vertices = geometry.attributes.position.array;
        const length = params.footLength / 100;
        const archHeight = params.archHeight / 50;
        const supportStrength = getSupportStrength(params.archSupport);
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            
            // 足弓支撑区域变形
            if (x > -length / 3 && x < length / 3) {
                const archFactor = Math.sin((x + length / 3) / (length / 1.5) * Math.PI);
                const widthFactor = Math.cos((y / (params.footWidth / 200)) * Math.PI / 2);
                vertices[i + 2] += archHeight * supportStrength * archFactor * widthFactor * 0.5;
            }
        }
        
        geometry.computeVertexNormals();
    }
    
    // 应用缓冲层曲面变形
    function applyCushionCurvature(geometry, params) {
        const vertices = geometry.attributes.position.array;
        const length = params.footLength / 100;
        const width = params.footWidth / 100;
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            
            // 前掌和足跟缓冲区域加厚
            if (x < -length / 3 || x > length / 3) {
                vertices[i + 2] += 0.005;
            }
            
            // 足弓区域变薄
            if (x > -length / 4 && x < length / 4) {
                vertices[i + 2] -= 0.003;
            }
        }
        
        geometry.computeVertexNormals();
    }
    
    // 创建网格支撑结构
    function createMeshSupportStructure(params) {
        const length = params.footLength / 100;
        const width = params.footWidth / 100;
        const totalHeight = (params.baseThickness + params.supportThickness + params.cushionThickness) / 100;
        
        // 创建网格几何体
        const segments = 15;
        const geometry = new THREE.PlaneGeometry(length, width, segments, segments);
        
        // 变形网格以匹配足弓形状
        const vertices = geometry.attributes.position.array;
        const archHeight = params.archHeight / 100;
        const supportStrength = getSupportStrength(params.archSupport);
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            
            // 创建足弓曲线变形
            if (x > -length / 3 && x < length / 3) {
                const archFactor = Math.sin((x + length / 3) / (length / 1.5) * Math.PI);
                const widthFactor = Math.cos((y / (width / 2)) * Math.PI / 2);
                vertices[i + 2] = archHeight * supportStrength * archFactor * widthFactor;
            }
        }
        
        geometry.computeVertexNormals();
        
        // 创建网格材质
        const material = new THREE.MeshStandardMaterial({
            color: 0x2ecc71,
            transparent: true,
            opacity: 0.6,
            metalness: 0.1,
            roughness: 0.7,
            wireframe: false,
            side: THREE.DoubleSide
        });
        
        // 创建线框材质
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x34495e,
            wireframe: true,
            transparent: true,
            opacity: 0.8
        });
        
        // 创建网格模型
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = totalHeight;
        mesh.rotation.x = Math.PI / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = 'meshSupport';
        insoleGroup.add(mesh);
        
        // 创建线框模型
        const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
        wireframe.position.y = totalHeight;
        wireframe.rotation.x = Math.PI / 2;
        wireframe.name = 'meshWireframe';
        insoleGroup.add(wireframe);
    }
    
    // 创建功能元素
    function createFunctionalElements(params) {
        const totalHeight = (params.baseThickness + params.supportThickness + params.cushionThickness) / 100;
        
        // 创建足弓支撑
        createArchSupport(params, totalHeight);
        
        // 创建足跟杯
        createHeelCup(params, totalHeight);
        
        // 创建跖骨垫
        createMetatarsalPad(params, totalHeight);
        
        // 创建足跟楔形
        if (params.heelWedges > 0) {
            createHeelWedges(params, totalHeight);
        }
    }
    
    // 创建足弓支撑
    function createArchSupport(params, totalHeight) {
        const archHeight = params.archHeight / 100;
        const supportStrength = getSupportStrength(params.archSupport);
        
        const archCurve = new THREE.CurvePath();
        
        // 创建足弓曲线
        const archPoints = [
            new THREE.Vector2(0.05, 0),
            new THREE.Vector2(0.15, archHeight * supportStrength * 0.5),
            new THREE.Vector2(0.25, archHeight * supportStrength),
            new THREE.Vector2(0.35, archHeight * supportStrength * 0.8),
            new THREE.Vector2(0.45, archHeight * supportStrength * 0.4),
            new THREE.Vector2(0.55, 0)
        ];
        
        const archSpline = new THREE.CatmullRomCurve3(archPoints.map(p => new THREE.Vector3(p.x, p.y, p.y)));
        
        const archGeometry = new THREE.TubeGeometry(archSpline, 20, 0.01, 8, false);
        const archMaterial = new THREE.MeshStandardMaterial({
            color: 0xf39c12,
            transparent: true,
            opacity: 0.9,
            metalness: 0.2,
            roughness: 0.6
        });
        
        const archMesh = new THREE.Mesh(archGeometry, archMaterial);
        archMesh.position.y = totalHeight;
        archMesh.rotation.z = Math.PI / 2;
        archMesh.castShadow = true;
        archMesh.name = 'archSupport';
        insoleGroup.add(archMesh);
    }
    
    // 创建足跟杯
    function createHeelCup(params, totalHeight) {
        const heelWidth = params.heelWidth / 100;
        const cupHeight = params.heelCup / 100;
        
        const heelGeometry = new THREE.CylinderGeometry(
            heelWidth / 3, // 顶部半径
            heelWidth / 2, // 底部半径
            cupHeight,     // 高度
            16             // 分段数
        );
        
        const heelMaterial = new THREE.MeshStandardMaterial({
            color: 0x9b59b6,
            transparent: true,
            opacity: 0.8,
            metalness: 0.1,
            roughness: 0.7
        });
        
        const heelMesh = new THREE.Mesh(heelGeometry, heelMaterial);
        heelMesh.position.set(-params.footLength / 200 + 0.05, totalHeight + cupHeight / 2, 0);
        heelMesh.castShadow = true;
        heelMesh.receiveShadow = true;
        heelMesh.name = 'heelCup';
        insoleGroup.add(heelMesh);
    }
    
    // 创建跖骨垫
    function createMetatarsalPad(params, totalHeight) {
        const padHeight = params.metatarsalPad / 100;
        if (padHeight <= 0) return;
        
        // 使用圆柱体替代胶囊体，提高兼容性
        const padGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
        const padMaterial = new THREE.MeshStandardMaterial({
            color: 0xe67e22,
            transparent: true,
            opacity: 0.9,
            metalness: 0,
            roughness: 0.8
        });
        
        const padMesh = new THREE.Mesh(padGeometry, padMaterial);
        padMesh.position.set(params.footLength / 400, totalHeight + padHeight / 2, 0);
        padMesh.rotation.z = Math.PI / 2;
        padMesh.castShadow = true;
        padMesh.name = 'metatarsalPad';
        insoleGroup.add(padMesh);
    }
    
    // 创建足跟楔形
    function createHeelWedges(params, totalHeight) {
        const wedgeAngle = params.heelWedges * Math.PI / 180;
        const heelWidth = params.heelWidth / 100;
        const heelLength = 0.1;
        
        const wedgeGeometry = new THREE.WedgeGeometry(
            heelWidth,   // 宽度
            heelLength,  // 长度
            0.02,        // 高度
            16           // 分段数
        );
        
        const wedgeMaterial = new THREE.MeshStandardMaterial({
            color: 0x34495e,
            transparent: true,
            opacity: 0.8,
            metalness: 0.2,
            roughness: 0.7
        });
        
        const wedgeMesh = new THREE.Mesh(wedgeGeometry, wedgeMaterial);
        wedgeMesh.position.set(-params.footLength / 200 + 0.05, totalHeight, 0);
        wedgeMesh.rotation.x = wedgeAngle;
        wedgeMesh.castShadow = true;
        wedgeMesh.receiveShadow = true;
        wedgeMesh.name = 'heelWedges';
        insoleGroup.add(wedgeMesh);
    }
    
    // 创建足部模型
    function createFootModel(params) {
        if (footModel) {
            insoleGroup.remove(footModel);
        }
        
        const length = params.footLength / 100;
        const width = params.footWidth / 100;
        const height = 0.12;
        const totalInsoleHeight = (params.baseThickness + params.supportThickness + params.cushionThickness) / 100;
        
        // 创建更接近真实足部的形状
        // 使用LatheGeometry创建足部轮廓
        const points = [];
        const segments = 20;
        
        // 足部轮廓点（从足跟到脚趾）
        points.push(new THREE.Vector2(0, -length / 2)); // 足跟
        points.push(new THREE.Vector2(width * 0.4, -length / 2 + length * 0.1)); // 足跟过渡
        points.push(new THREE.Vector2(width * 0.35, -length / 2 + length * 0.2)); // 足弓
        points.push(new THREE.Vector2(width * 0.4, -length / 2 + length * 0.3)); // 足弓
        points.push(new THREE.Vector2(width * 0.5, -length / 2 + length * 0.4)); // 足弓前
        points.push(new THREE.Vector2(width * 0.6, -length / 2 + length * 0.5)); // 前掌
        points.push(new THREE.Vector2(width * 0.7, -length / 2 + length * 0.6)); // 前掌
        points.push(new THREE.Vector2(width * 0.8, -length / 2 + length * 0.7)); // 脚趾根
        points.push(new THREE.Vector2(width * 0.6, -length / 2 + length * 0.8)); // 脚趾
        points.push(new THREE.Vector2(width * 0.4, -length / 2 + length * 0.9)); // 脚趾尖
        points.push(new THREE.Vector2(0, -length / 2 + length)); // 脚趾尖
        
        // 创建旋转几何体
        const footGeometry = new THREE.LatheGeometry(points, segments);
        
        // 应用足部曲线变形
        applyFootDeformation(footGeometry, params);
        
        const footMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5d76e,
            transparent: true,
            opacity: 0.8, // 提高透明度，确保可见
            metalness: 0.1,
            roughness: 0.8,
            side: THREE.DoubleSide
        });
        
        footModel = new THREE.Mesh(footGeometry, footMaterial);
        
        // 调整模型位置和旋转
        footModel.rotation.y = Math.PI / 2;
        footModel.position.set(0, totalInsoleHeight + height / 2, 0);
        
        footModel.castShadow = true;
        footModel.receiveShadow = true;
        footModel.name = 'footModel';
        footModel.visible = true; // 确保模型可见
        insoleGroup.add(footModel);
        
        console.log('Foot model created successfully');
        console.log('Foot model position:', footModel.position.x.toFixed(3), footModel.position.y.toFixed(3), footModel.position.z.toFixed(3));
        console.log('Foot model scale:', footModel.scale.x.toFixed(3), footModel.scale.y.toFixed(3), footModel.scale.z.toFixed(3));
        console.log('Foot model visibility:', footModel.visible);
    }
    
    // 应用足部曲线变形
    function applyFootDeformation(geometry, params) {
        const vertices = geometry.attributes.position.array;
        const length = params.footLength / 100;
        const archHeight = params.archHeight / 1000;
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];
            
            // 横向曲线（足弓方向）
            const archCurve = Math.cos((y / length) * Math.PI);
            vertices[i + 2] += archCurve * archHeight * 2;
            
            // 纵向曲线（前后方向）
            const lengthCurve = Math.sin((y + length / 2) / length * Math.PI);
            vertices[i + 2] += lengthCurve * archHeight * 0.5;
            
            // 足部宽度变化
            const widthCurve = Math.sin((y + length / 2) / length * Math.PI);
            vertices[i] *= (1 + widthCurve * 0.1);
        }
        
        geometry.computeVertexNormals();
    }
    
    // 创建鞋垫形状（使用贝塞尔曲线实现更真实的轮廓）
    function createInsoleShape(params, offset = 0) {
        const length = params.footLength / 100;
        const width = params.footWidth / 100;
        const heelWidth = params.heelWidth / 100;
        
        const shape = new THREE.Shape();
        
        // 计算关键点
        const heelX = -length / 2 + offset;
        const toeX = length / 2 - offset;
        const midX = 0 + offset;
        
        // 起始点：足跟外侧
        shape.moveTo(heelX, -heelWidth / 2 + offset);
        
        // 足跟外侧到足弓外侧：贝塞尔曲线
        shape.bezierCurveTo(
            heelX, -heelWidth / 3 + offset,
            heelX + length / 8, -width / 3 + offset,
            midX - length / 8, -width / 2.5 + offset
        );
        
        // 足弓外侧到前掌外侧：贝塞尔曲线
        shape.bezierCurveTo(
            midX + length / 8, -width / 3 + offset,
            toeX - length / 8, -width / 4 + offset,
            toeX, -width / 5 + offset
        );
        
        // 前掌外侧到前掌内侧：贝塞尔曲线
        shape.bezierCurveTo(
            toeX - length / 16, width / 5 + offset,
            toeX - length / 8, width / 4 + offset,
            toeX, width / 5 + offset
        );
        
        // 前掌内侧到足弓内侧：贝塞尔曲线
        shape.bezierCurveTo(
            toeX - length / 8, width / 3 + offset,
            midX + length / 8, width / 3 + offset,
            midX - length / 8, width / 2.5 + offset
        );
        
        // 足弓内侧到足跟内侧：贝塞尔曲线
        shape.bezierCurveTo(
            heelX + length / 8, width / 3 + offset,
            heelX, heelWidth / 3 + offset,
            heelX, heelWidth / 2 - offset
        );
        
        // 足跟内侧到起始点：直线
        shape.lineTo(heelX, -heelWidth / 2 + offset);
        
        shape.closePath();
        
        return shape;
    }
    
    // 获取支撑强度系数
    function getSupportStrength(strength) {
        const strengthMap = {
            'low': 0.6,
            'medium': 1.0,
            'high': 1.4,
            'extraHigh': 1.8
        };
        return strengthMap[strength] || 1.0;
    }
    
    // 动画循环
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    
    // 表单提交处理
    footForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // 获取表单数据
        const formData = new FormData(footForm);
        const params = {
            footLength: parseFloat(formData.get('footLength')),
            footWidth: parseFloat(formData.get('footWidth')),
            archHeight: parseFloat(formData.get('archHeight')),
            heelWidth: parseFloat(formData.get('heelWidth')),
            archType: formData.get('archType'),
            footConditions: Array.from(formData.getAll('footCondition')),
            baseLayer: formData.get('baseLayer'),
            baseThickness: parseFloat(formData.get('baseThickness')),
            supportLayer: formData.get('supportLayer'),
            supportThickness: parseFloat(formData.get('supportThickness')),
            cushionLayer: formData.get('cushionLayer'),
            cushionThickness: parseFloat(formData.get('cushionThickness')),
            archSupport: formData.get('archSupport'),
            heelCup: parseFloat(formData.get('heelCup')),
            metatarsalPad: parseFloat(formData.get('metatarsalPad')),
            heelWedges: parseFloat(formData.get('heelWedges')),
            shoeType: formData.get('shoeType')
        };
        
        // 生成新的鞋垫模型
        createInsoleModel(params);
        
        // 更新设计信息
        updateDesignInfo(params);
        
        // 显示成功消息
        alert('三维矫正鞋垫设计已生成！请查看右侧3D预览。');
    });
    
    // 更新设计信息
    function updateDesignInfo(params) {
        const archTypeText = {
            'flat': '扁平足',
            'normal': '正常足弓',
            'high': '高弓足'
        };
        
        const materialText = {
            'eva': 'EVA (轻便舒适)',
            'polyurethane': '聚氨酯 (耐用支撑)',
            'thermoplastic': '热塑性材料 (可塑形)',
            'carbonFiber': '碳纤维 (高强度)',
            'glassFiber': '玻璃纤维 (中等强度)',
            'plastic': '塑料 (轻质支撑)',
            'memoryFoam': '记忆海绵 (贴合缓震)',
            'gel': '凝胶 (高缓冲)',
            'poron': 'PORON (回弹缓震)'
        };
        
        const shoeTypeText = {
            'casual': '休闲鞋',
            'running': '运动鞋',
            'formal': '正装鞋',
            'boot': '靴子',
            'sports': '专业运动鞋'
        };
        
        const footConditionsText = {
            'pronation': '足内翻',
            'supination': '足外翻',
            'plantar': '足底筋膜炎',
            'heelPain': '足跟痛',
            'kneePain': '膝关节痛',
            'anklePain': '踝关节痛'
        };
        
        const conditionsText = params.footConditions.length > 0 
            ? params.footConditions.map(cond => footConditionsText[cond]).join(', ') 
            : '无';
        
        designInfo.innerHTML = `
            <h4>设计信息</h4>
            <p><strong>足部长度:</strong> ${params.footLength} mm</p>
            <p><strong>足部宽度:</strong> ${params.footWidth} mm</p>
            <p><strong>足弓高度:</strong> ${params.archHeight} mm</p>
            <p><strong>足弓类型:</strong> ${archTypeText[params.archType]}</p>
            <p><strong>足部问题:</strong> ${conditionsText}</p>
            <p><strong>基层材料:</strong> ${materialText[params.baseLayer]}</p>
            <p><strong>支撑层材料:</strong> ${materialText[params.supportLayer]}</p>
            <p><strong>缓冲层材料:</strong> ${materialText[params.cushionLayer]}</p>
            <p><strong>足弓支撑强度:</strong> ${params.archSupport}</p>
            <p><strong>足跟杯高度:</strong> ${params.heelCup} mm</p>
            <p><strong>跖骨垫高度:</strong> ${params.metatarsalPad} mm</p>
            <p><strong>足跟楔形角度:</strong> ${params.heelWedges}°</p>
            <p><strong>使用鞋型:</strong> ${shoeTypeText[params.shoeType]}</p>
            <p><strong>状态:</strong> 三维设计已生成</p>
        `;
    }
    
    // 按钮控制
    rotateLeftBtn.addEventListener('click', () => {
        insoleGroup.rotation.y -= 0.1;
    });
    
    rotateRightBtn.addEventListener('click', () => {
        insoleGroup.rotation.y += 0.1;
    });
    
    zoomInBtn.addEventListener('click', () => {
        camera.position.z = Math.max(5, camera.position.z - 0.5);
    });
    
    zoomOutBtn.addEventListener('click', () => {
        camera.position.z = Math.min(20, camera.position.z + 0.5);
    });
    
    resetViewBtn.addEventListener('click', () => {
        camera.position.set(0, 5, 15);
        camera.lookAt(0, 0, 0);
        insoleGroup.rotation.set(0, 0, 0);
    });
    
    showLayersBtn.addEventListener('click', () => {
        isLayersVisible = !isLayersVisible;
        toggleLayersVisibility(isLayersVisible);
        showLayersBtn.textContent = isLayersVisible ? '隐藏层次' : '显示层次';
    });
    
    // 切换层次可见性
    function toggleLayersVisibility(visible) {
        insoleGroup.children.forEach(child => {
            if (child.name !== 'footModel') {
                child.visible = visible;
            }
        });
    }
    
    // 平滑滚动
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });
    
    // 添加滚动动画
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // 观察所有section
    document.querySelectorAll('section').forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(50px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });
    
    // 初始化3D场景
    initThreeJS();
});