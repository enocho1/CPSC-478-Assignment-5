"use strict";
var Reflection = Reflection || {
  ambient: new Pixel(0, 0, 0),
  diffuse: new Pixel(1.0, 1.0, 1.0),
  specular: new Pixel(1.0, 1.0, 1.0),
  shininess: 20,
};

function phongReflectionModelImpl(
  vertex,
  view,
  normal,
  lightPos,
  phongMaterial
) {
  // Calculate the view direction
  let viewDir = new THREE.Vector3()
    .subVectors(new THREE.Vector3().setFromMatrixPosition(view), vertex)
    .normalize();

  // Calculate the light direction
  var lightDir = new THREE.Vector3().subVectors(lightPos, vertex).normalize();
  var ndotl = normal.dot(lightDir);

  // Calculate the reflection direction
  let reflectionDir = lightDir.clone().negate().reflect(normal);

  // Calculate the ambient term
  let ambient = new THREE.Vector3().copy(phongMaterial.ambient);

  // Calculate the diffuse term
  const diffuse = new THREE.Vector3()
    .copy(phongMaterial.diffuse)
    .multiplyScalar(Math.abs(ndotl));

  // Calculate the specular term
  let specular = phongMaterial.specular
    .clone()
    .multiplyScalar(
      Math.pow(Math.max(reflectionDir.dot(viewDir), 0), phongMaterial.shininess)
    );

  // Add the ambient, diffuse, and specular terms together
  let color = new THREE.Vector3().addVectors(ambient, diffuse).add(specular);

  return new Pixel(color.x, color.y, color.z);
}

Reflection.phongReflectionModel = function (
  vertex,
  view,
  normal,
  lightPos,
  phongMaterial
) {
  const mat = {
    ambient: new THREE.Vector3(
      phongMaterial.ambient.r,
      phongMaterial.ambient.g,
      phongMaterial.ambient.b
    ),
    diffuse: new THREE.Vector3(
      phongMaterial.diffuse.r,
      phongMaterial.diffuse.g,
      phongMaterial.diffuse.b
    ),
    specular: new THREE.Vector3(
      phongMaterial.specular.r,
      phongMaterial.specular.g,
      phongMaterial.specular.b
    ),
    shininess: phongMaterial.shininess,
  };
  return phongReflectionModelImpl(vertex, view, normal, lightPos, mat);
};

var Renderer = Renderer || {
  meshInstances: new Set(),
  width: 1000,
  height: 750,
  negNear: 0.3,
  negFar: 1000,
  fov: 45,
  lightPos: new THREE.Vector3(10, 10, -10),
  shaderMode: "",
  cameraLookAtVector: new THREE.Vector3(0, 0, 0),
  cameraPosition: new THREE.Vector3(0, 0, -10),
  cameraUpVector: new THREE.Vector3(0, -1, 0),
  cameraUpdated: true,
};

Renderer.updateCameraParameters = function () {
  this.camera.position.copy(this.cameraPosition);
  this.camera.up.copy(this.cameraUpVector);
  this.camera.lookAt(this.cameraLookAtVector);
};

Renderer.initialize = function () {
  this.buffer = new Image(this.width, this.height);
  this.zBuffer = [];

  // set camera
  this.camera = new THREE.PerspectiveCamera(
    this.fov,
    this.width / this.height,
    this.negNear,
    this.negFar
  );
  this.updateCameraParameters();

  this.clearZBuffer();
  this.buffer.display(); // initialize canvas
};

Renderer.clearZBuffer = function () {
  for (var x = 0; x < this.width; x++) {
    this.zBuffer[x] = new Float32Array(this.height);
    for (var y = 0; y < this.height; y++) {
      this.zBuffer[x][y] = 1; // z value is in [-1 1];
    }
  }
};

Renderer.addMeshInstance = function (meshInstance) {
  assert(
    meshInstance.mesh,
    "meshInstance must have mesh to be added to renderer"
  );
  this.meshInstances.add(meshInstance);
};

Renderer.removeMeshInstance = function (meshInstance) {
  this.meshInstances.delete(meshInstance);
};

Renderer.clear = function () {
  this.buffer.clear();
  this.clearZBuffer();
  Main.context.clearRect(0, 0, Main.canvas.width, Main.canvas.height);
};

Renderer.displayImage = function () {
  this.buffer.display();
};

Renderer.render = function () {
  this.clear();

  var eps = 0.01;
  if (
    !(
      this.cameraUpVector.distanceTo(this.camera.up) < eps &&
      this.cameraPosition.distanceTo(this.camera.position) < eps &&
      this.cameraLookAtVector.distanceTo(Main.controls.target) < eps
    )
  ) {
    this.cameraUpdated = false;
    // update camera position
    this.cameraLookAtVector.copy(Main.controls.target);
    this.cameraPosition.copy(this.camera.position);
    this.cameraUpVector.copy(this.camera.up);
  } else {
    // camera's stable, update url once
    if (!this.cameraUpdated) {
      Gui.updateUrl();
      this.cameraUpdated = true; //update one time
    }
  }

  this.camera.updateMatrixWorld();
  this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);

  // light goes with the camera, COMMENT this line for debugging if you want
  this.lightPos = this.camera.position;

  for (var meshInst of this.meshInstances) {
    var mesh = meshInst.mesh;
    if (mesh !== undefined) {
      for (var faceIdx = 0; faceIdx < mesh.faces.length; faceIdx++) {
        var face = mesh.faces[faceIdx];
        var verts = [
          mesh.vertices[face.a],
          mesh.vertices[face.b],
          mesh.vertices[face.c],
        ];
        var vert_normals = [
          mesh.vertex_normals[face.a],
          mesh.vertex_normals[face.b],
          mesh.vertex_normals[face.c],
        ];

        // camera's view matrix = K * [R | t] where K is the projection matrix and [R | t] is the inverse of the camera pose
        var viewMat = new THREE.Matrix4().multiplyMatrices(
          this.camera.projectionMatrix,
          this.camera.matrixWorldInverse
        );

        Renderer.drawTriangle(
          verts,
          vert_normals,
          mesh.uvs[faceIdx],
          meshInst.material,
          viewMat
        );
      }
    }
  }

  this.displayImage();
};

Renderer.getPhongMaterial = function (uv_here, material) {
  var phongMaterial = {};
  phongMaterial.ambient = Reflection.ambient;

  if (material.diffuse === undefined || uv_here === undefined) {
    phongMaterial.diffuse = Reflection.diffuse;
  } else if (Pixel.prototype.isPrototypeOf(material.diffuse)) {
    phongMaterial.diffuse = material.diffuse;
  } else {
    // note that this function uses point sampling. it would be better to use bilinear
    // subsampling and mipmaps for area sampling, but this good enough for now...
    phongMaterial.diffuse = material.diffuse.getPixel(
      Math.floor(uv_here.x * material.diffuse.width),
      Math.floor(uv_here.y * material.diffuse.height)
    );
  }

  if (material.specular === undefined || uv_here === undefined) {
    phongMaterial.specular = Reflection.specular;
  } else if (Pixel.prototype.isPrototypeOf(material.specular)) {
    phongMaterial.specular = material.specular;
  } else {
    phongMaterial.specular = material.specular.getPixel(
      Math.floor(uv_here.x * material.specular.width),
      Math.floor(uv_here.y * material.specular.height)
    );
  }

  phongMaterial.shininess = Reflection.shininess;

  return phongMaterial;
};

Renderer.projectVerticesNaive = function (verts) {
  // this is a naive orthogonal projection that does not even consider camera pose
  var projectedVerts = [];

  var orthogonalScale = 5;
  for (var i = 0; i < 3; i++) {
    projectedVerts[i] = new THREE.Vector4(
      verts[i].x,
      verts[i].y,
      verts[i].z,
      1.0
    );

    projectedVerts[i].x /= orthogonalScale;
    projectedVerts[i].y /= (orthogonalScale * this.height) / this.width;

    projectedVerts[i].x =
      (projectedVerts[i].x * this.width) / 2 + this.width / 2;
    projectedVerts[i].y =
      (projectedVerts[i].y * this.height) / 2 + this.height / 2;
  }

  return projectedVerts;
};

Renderer.projectVertices = function (verts, viewMat) {
  // Vector3/Vector4 array of projected vertices in screen space coordinates
  // (you still need z for z buffering)
  var projectedVerts = [];

  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 12 lines of code.
  //for each vert on the triangle

  for (var i = 0; i < 3; i++) {
    projectedVerts[i] = new THREE.Vector4(
      verts[i].x,
      verts[i].y,
      verts[i].z,
      1.0
    ).applyMatrix4(viewMat);

    let orthogonalScale = projectedVerts[i].w;

    // Normalize the projected vertices
    projectedVerts[i].x /= orthogonalScale;
    projectedVerts[i].y /= orthogonalScale;

    // Scale them to fit within the display
    projectedVerts[i].x =
      (projectedVerts[i].x * this.width) / 2 + this.width / 2;
    projectedVerts[i].y =
      (projectedVerts[i].y * this.height) / 2 + this.height / 2;
  }
  // ----------- STUDENT CODE END ------------

  return projectedVerts;
};

Renderer.computeBoundingBox = function (projectedVerts) {
  // Compute the screen-space bounding box for the triangle defined in projectedVerts[0-2].
  // We will need to call this helper function in the shading functions
  // to loop over pixel locations in the bounding box for rasterization.

  var box = {};
  box.minX = this.width - 1;
  box.minY = this.height - 1;
  box.maxX = 0;
  box.maxY = 0;

  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 14 lines of code.
  // Computing bounding box from projectedVerts
  for (const p of projectedVerts) {
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  }
  // ----------- STUDENT CODE END ------------

  return box;
};

Renderer.computeBarycentric = function (projectedVerts, x, y) {
  var triCoords = [];
  // (see https://fgiesen.wordpress.com/2013/02/06/the-barycentric-conspirac/)
  // return undefined if (x,y) is outside the triangle
  // ----------- STUDENT CODE BEGIN ------------
  const box = this.computeBoundingBox(projectedVerts);
  if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) {
    return undefined;
  }

  let a = projectedVerts[0];
  let b = projectedVerts[1];
  let c = projectedVerts[2];

  const determinant = (v0, v1) => v0.x * v1.y - v0.y * v1.x;
  const scaledTriangleArea = (v0, v1, v2) =>
    determinant(v1.clone().sub(v0), v2.clone().sub(v0));

  const edgeFn = (v0, v1, p) =>
    (v1.x - v0.x) * (p.y - v0.y) - (v1.y - v0.y) * (p.x - v0.x);

  const p = new THREE.Vector2(x, y);
  const area = scaledTriangleArea(a, b, c);
  const l0 = edgeFn(b, c, p) / area;
  const l1 = edgeFn(c, a, p) / area;
  const l2 = edgeFn(a, b, p) / area;

  let upper_limit = Math.max(l0, l1, l2);
  let lower_limit = Math.min(l0, l1, l2);

  // Do a check to see if we are inside or outside of the triangle
  if (lower_limit < 0) {
    return undefined;
  }

  if (upper_limit > 1) {
    return undefined;
  }

  return [l0, l1, l2];
};

Renderer.safeExtractUv = function (uv) {
  if (uv !== undefined) {
    return uv;
  }

  return [undefined, undefined, undefined];
};

Renderer.barycentricInterpolation = function (alpha, beta, gamma, v1, v2, v3) {
  if (v1 === undefined || v2 === undefined || v3 === undefined) {
    return undefined;
  }

  return v1
    .clone()
    .multiplyScalar(alpha)
    .add(v2.clone().multiplyScalar(beta))
    .add(v3.clone().multiplyScalar(gamma));
};

Renderer.drawTriangleWire = function (projectedVerts) {
  var color = new Pixel(1.0, 0, 0);
  for (var i = 0; i < 3; i++) {
    var va = projectedVerts[(i + 1) % 3];
    var vb = projectedVerts[(i + 2) % 3];

    var ba = new THREE.Vector2(vb.x - va.x, vb.y - va.y);
    var len_ab = ba.length();
    ba.normalize();
    // draw line
    for (var j = 0; j < len_ab; j += 0.5) {
      var x = Math.round(va.x + ba.x * j);
      var y = Math.round(va.y + ba.y * j);
      this.buffer.setPixel(x, y, color);
    }
  }
};

Renderer.drawTriangleFlat = function (
  verts,
  projectedVerts,
  normals,
  uvs,
  material
) {
  // Flat shader
  // Color of each face is computed based on the face normal
  // (average of vertex normals) and face centroid.
  const n1 = normals[0];
  const n2 = normals[1];
  const n3 = normals[2];

  // Compute the face normal and centroid
  const n = new THREE.Vector3();
  n.crossVectors(n2.clone().sub(n1), n3.clone().sub(n1));
  n.normalize();

  const v1 = verts[0];
  const v2 = verts[1];
  const v3 = verts[2];
  const centroid = new THREE.Vector3();
  centroid.add(v1);
  centroid.add(v2);
  centroid.add(v3);
  centroid.divideScalar(3.0);

  // Compute the color of the face
  const viewMat = new THREE.Matrix4().multiplyMatrices(
    this.camera.projectionMatrix,
    this.camera.matrixWorldInverse
  );

  const [uv1, uv2, uv3] = this.safeExtractUv(uvs);

  // const uv1 = uvs[0];
  // const uv2 = uvs[1];
  // const uv3 = uvs[2];

  // Rasterize the triangle
  // Compute barycentric coordinates for the triangle
  const box = this.computeBoundingBox(projectedVerts);
  let { minX, maxX, minY, maxY } = box;

  minX = Math.floor(Math.max(minX, 0));
  maxX = Math.floor(Math.min(maxX, this.width - 1));
  minY = Math.floor(Math.max(minY, 0));
  maxY = Math.floor(Math.min(maxY, this.height - 1));

  // Iterate over the bounding box of the triangle
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      // Check if pixel is within the screen
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
        continue;
      }

      const bary = this.computeBarycentric(projectedVerts, x, y);

      // Check if pixel is inside the triangle
      if (bary) {
        const [alpha, beta, gamma] = bary;
        const interpolatedUV = this.barycentricInterpolation(
          alpha,
          beta,
          gamma,
          uv1,
          uv2,
          uv3
        );

        const phongMaterial =
          uvs === undefined
            ? this.getPhongMaterial(uvs, material)
            : this.getPhongMaterial(interpolatedUV, material);
        const color = Reflection.phongReflectionModel(
          centroid,
          viewMat,
          n,
          this.lightPos,
          phongMaterial
        );

        // Compute depth value for the pixel
        const depth =
          (bary[0] / projectedVerts[0].w) * projectedVerts[0].z +
          (bary[1] / projectedVerts[1].w) * projectedVerts[1].z +
          (bary[2] / projectedVerts[2].w) * projectedVerts[2].z;

        // Check if pixel is closer than the current depth value
        if (depth < this.zBuffer[x][y]) {
          // Set pixel color
          this.buffer.setPixel(x, y, color);

          // Update z-buffer
          this.zBuffer[x][y] = depth;
        }
      }
    }
  }
};

Renderer.drawTriangleGouraud = function (
  verts,
  projectedVerts,
  normals,
  uvs,
  material
) {
  // Gouraud shader
  // Interpolate the color for each pixel in the triangle using the barycentric coordinate.
  const n1 = normals[0];
  const n2 = normals[1];
  const n3 = normals[2];

  // Compute the face normal and centroid
  const n = new THREE.Vector3();
  n.crossVectors(n2.clone().sub(n1), n3.clone().sub(n1));
  n.normalize();

  const v1 = verts[0];
  const v2 = verts[1];
  const v3 = verts[2];

  const [uv1, uv2, uv3] = this.safeExtractUv(uvs);

  // Compute the color of the face
  const viewMat = new THREE.Matrix4().multiplyMatrices(
    this.camera.projectionMatrix,
    this.camera.matrixWorldInverse
  );

  // Rasterize the triangle
  // Compute barycentric coordinates for the triangle
  const box = this.computeBoundingBox(projectedVerts);
  let { minX, maxX, minY, maxY } = box;

  minX = Math.floor(Math.max(minX, 0));
  maxX = Math.floor(Math.min(maxX, this.width - 1));
  minY = Math.floor(Math.max(minY, 0));
  maxY = Math.floor(Math.min(maxY, this.height - 1));

  // Iterate over the bounding box of the triangle
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      // Check if pixel is within the screen
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
        continue;
      }

      const bary = this.computeBarycentric(projectedVerts, x, y);

      // Check if pixel is inside the triangle
      if (bary) {
        // Compute depth value for the pixel
        const depth =
          (bary[0] / projectedVerts[0].w) * projectedVerts[0].z +
          (bary[1] / projectedVerts[1].w) * projectedVerts[1].z +
          (bary[2] / projectedVerts[2].w) * projectedVerts[2].z;

        const [alpha, beta, gamma] = bary;

        const interpolatedUV = this.barycentricInterpolation(
          alpha,
          beta,
          gamma,
          uv1,
          uv2,
          uv3
        );

        const phongMaterial =
          uvs === undefined
            ? this.getPhongMaterial(uvs, material)
            : this.getPhongMaterial(interpolatedUV, material);
        const c1 = Reflection.phongReflectionModel(
          v1,
          viewMat,
          n1,
          this.lightPos,
          phongMaterial
        );

        const c2 = Reflection.phongReflectionModel(
          v2,
          viewMat,
          n2,
          this.lightPos,
          phongMaterial
        );

        const c3 = Reflection.phongReflectionModel(
          v3,
          viewMat,
          n3,
          this.lightPos,
          phongMaterial
        );

        const interpolatedColor = c1
          .copy()
          .multipliedBy(alpha)
          .plus(c2.copy().multipliedBy(beta))
          .plus(c3.copy().multipliedBy(gamma));

        // Check if pixel is closer than the current depth value
        if (depth < this.zBuffer[x][y]) {
          // Set pixel color
          this.buffer.setPixel(x, y, interpolatedColor);

          // Update z-buffer
          this.zBuffer[x][y] = depth;
        }
      }
    }
  }
};

Renderer.drawTrianglePhong = function (
  verts,
  projectedVerts,
  normals,
  uvs,
  material
) {
  // Phong shader
  // (1) Basic Phong shader: Interpolate the normal and vertex for each pixel in the triangle
  //                         using the barycentric coordinate.
  // (2) Texture mapping: If uvs is provided, compute interpolated uv coordinates
  //                      and map the phong material texture (if available)
  //                      at the uv coordinates to the pixel location.
  // (3) XYZ normal mapping: If xyz normal texture exists for the material,
  //                         convert the RGB value of the XYZ normal texture at the uv coordinates
  //                         to a normal vector and apply it at the pixel location.
  // Flat shader
  // Color of each face is computed based on the face normal
  // (average of vertex normals) and face centroid.
  const n1 = normals[0];
  const n2 = normals[1];
  const n3 = normals[2];

  // Compute the face normal and centroid
  const n = new THREE.Vector3();
  n.crossVectors(n2.clone().sub(n1), n3.clone().sub(n1));
  n.normalize();

  const v1 = verts[0];
  const v2 = verts[1];
  const v3 = verts[2];

  const [uv1, uv2, uv3] = this.safeExtractUv(uvs);

  // Compute the color of the face
  const viewMat = new THREE.Matrix4().multiplyMatrices(
    this.camera.projectionMatrix,
    this.camera.matrixWorldInverse
  );

  // const phongMaterial = this.getPhongMaterial(uvs, material);
  // Rasterize the triangle
  // Compute barycentric coordinates for the triangle
  const box = this.computeBoundingBox(projectedVerts);
  let { minX, maxX, minY, maxY } = box;

  minX = Math.floor(Math.max(minX, 0));
  maxX = Math.floor(Math.min(maxX, this.width - 1));
  minY = Math.floor(Math.max(minY, 0));
  maxY = Math.floor(Math.min(maxY, this.height - 1));

  let logOnce = true;

  // Iterate over the bounding box of the triangle
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      // Check if pixel is within the screen
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
        continue;
      }

      const bary = this.computeBarycentric(projectedVerts, x, y);

      // Check if pixel is inside the triangle
      if (bary) {
        // Compute depth value for the pixel
        const depth =
          (bary[0] / projectedVerts[0].w) * projectedVerts[0].z +
          (bary[1] / projectedVerts[1].w) * projectedVerts[1].z +
          (bary[2] / projectedVerts[2].w) * projectedVerts[2].z;

        const [alpha, beta, gamma] = bary;

        const interpolatedUV = this.barycentricInterpolation(
          alpha,
          beta,
          gamma,
          uv1,
          uv2,
          uv3
        );

        let xyzNormal;
        // JUST NEED TO GET THIS WORKING
        let got_xyz = false;
        if (material.xyzNormal !== undefined) {
          const xyzNormalPx = material.xyzNormal.getPixel(
            Math.floor(interpolatedUV.x * material.xyzNormal.width),
            Math.floor(interpolatedUV.y * material.xyzNormal.height)
          );

          // Need to turn this into rgb and then do something with it
          xyzNormal = new THREE.Vector3(
            xyzNormalPx.r,
            xyzNormalPx.g,
            xyzNormalPx.b
          );

          xyzNormal = xyzNormal.normalize();
          xyzNormal = xyzNormal.multiplyScalar(2.0);
          xyzNormal.x -= 1;
          xyzNormal.y -= 1;
          xyzNormal.z -= 1;
          got_xyz = true;
        }

        const interpolatedVertex = v1
          .clone()
          .multiplyScalar(alpha)
          .add(v2.clone().multiplyScalar(beta))
          .add(v3.clone().multiplyScalar(gamma));

        let interpolatedNormal = n1
          .clone()
          .multiplyScalar(alpha)
          .add(n2.clone().multiplyScalar(beta))
          .add(n3.clone().multiplyScalar(gamma));

        if (got_xyz) {
          interpolatedNormal = xyzNormal.normalize();
        }

        const phongMaterial =
          uvs === undefined
            ? this.getPhongMaterial(uvs, material)
            : this.getPhongMaterial(interpolatedUV, material);

        const color = Reflection.phongReflectionModel(
          interpolatedVertex,
          viewMat,
          interpolatedNormal,
          this.lightPos,
          phongMaterial
        );

        // Check if pixel is closer than the current depth value
        if (depth < this.zBuffer[x][y]) {
          // Set pixel color
          this.buffer.setPixel(x, y, color);

          // Update z-buffer
          this.zBuffer[x][y] = depth;
        }
      }
    }
  }
};

Renderer.drawTriangle = function (verts, normals, uvs, material, viewMat) {
  var projectedVerts = this.projectVertices(verts, viewMat);
  if (projectedVerts === undefined) {
    // not within near and far plane
    return;
  } else if (projectedVerts.length <= 0) {
    projectedVerts = this.projectVerticesNaive(verts);
  }

  switch (this.shaderMode) {
    case "Wire":
      this.drawTriangleWire(projectedVerts);
      break;
    case "Flat":
      this.drawTriangleFlat(verts, projectedVerts, normals, uvs, material);
      break;
    case "Gouraud":
      this.drawTriangleGouraud(verts, projectedVerts, normals, uvs, material);
      break;
    case "Phong":
      this.drawTrianglePhong(verts, projectedVerts, normals, uvs, material);
      break;
    default:
  }
};
