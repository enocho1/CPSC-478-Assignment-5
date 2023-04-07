"use strict";
var Reflection = Reflection || {
  ambient: new Pixel(0, 0, 0),
  diffuse: new Pixel(1.0, 1.0, 1.0),
  specular: new Pixel(1.0, 1.0, 1.0),
  shininess: 20,
};

Reflection.phongReflectionModel = function (
  vertex,
  view,
  normal,
  lightPos,
  phongMaterial
) {
  var color = new Pixel(0, 0, 0);
  normal.normalize();

  // diffuse
  var light_dir = new THREE.Vector3().subVectors(lightPos, vertex).normalize();
  var ndotl = normal.dot(light_dir);
  color.plus(phongMaterial.diffuse.copy().multipliedBy(ndotl));

  // Ambient color and specular color
  // ----------- STUDENT CODE BEGIN ------------
  const ambient = phongMaterial.ambient;

  // Ambient color
  color.plus(ambient);

  // Specular color
  const specular = phongMaterial.specular.multipliedBy(
    Math.pow(ndotl, phongMaterial.shininess)
  );
  color.plus(specular);

  // ----------- STUDENT CODE END ------------

  return new Pixel(1,1,1,vertex.z) //white for debugging
  return color;
  
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

    projectedVerts[i].x /= orthogonalScale;
    projectedVerts[i].y /= orthogonalScale; // * this.height) / this.width;

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
  box.minX = 100000000;
  box.minY = 100000000;
  box.maxX = -100000000;
  box.maxY = -100000000;

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

  // Compute barycentric coordinates for (x,y) with respect to the triangle
  // defined in projectedVerts[0-2].

  // this is equivalent to your original one, just abit shorter. @enoch
  let alpha =
    (a.x * (c.y - a.y) + (y - a.y) * (c.x - a.x) - x * (c.y - a.y)) /
    ((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y));

  let beta = (y - a.y - alpha * (b.y - a.y)) / (c.y - a.y);

  // let alpha =
  //   ((projectedVerts[1].y - projectedVerts[2].y) * (x - projectedVerts[2].x) +
  //     (projectedVerts[2].x - projectedVerts[1].x) * (y - projectedVerts[2].y)) /
  //   ((projectedVerts[1].y - projectedVerts[2].y) *
  //     (projectedVerts[0].x - projectedVerts[2].x) +
  //     (projectedVerts[2].x - projectedVerts[1].x) *
  //       (projectedVerts[0].y - projectedVerts[2].y));
  // const beta =
  //   ((projectedVerts[2].y - projectedVerts[0].y) * (x - projectedVerts[2].x) +
  //     (projectedVerts[0].x - projectedVerts[2].x) * (y - projectedVerts[2].y)) /
  //   ((projectedVerts[1].y - projectedVerts[2].y) *
  //     (projectedVerts[0].x - projectedVerts[2].x) +
  //     (projectedVerts[2].x - projectedVerts[1].x) *
  //       (projectedVerts[0].y - projectedVerts[2].y));

  let gamma = 1 - alpha - beta;

  let upper_limit = Math.max(alpha, beta, gamma);
  let lower_limit = Math.min(alpha, beta, gamma);

  if (lower_limit < 0) {
    return undefined;
  }
  if (upper_limit > 1) {
    return undefined;
  }

  triCoords = [gamma, alpha, beta];

  // ----------- STUDENT CODE END ------------
  return triCoords;
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
  centroid.divideScalar(3);

  // Compute the color of the face
  const viewMat = new THREE.Matrix4().multiplyMatrices(
    this.camera.projectionMatrix,
    this.camera.matrixWorldInverse
  );
  const phongMaterial = this.getPhongMaterial(uvs, material);
  const color = Reflection.phongReflectionModel(
    centroid,
    viewMat,
    n,
    this.lightPos,
    phongMaterial
  );

  // Rasterize the triangle
  const box = this.computeBoundingBox(projectedVerts);
  for (let x = box.minX; x <= box.maxX; x++) {
    for (let y = box.minY; y <= box.maxY; y++) {
      const triCoords = this.computeBarycentric(projectedVerts, x, y);
      if (triCoords) {
        let xx = Math.floor(x);
        let yy = Math.floor(y);
        if (xx < this.width && y < this.height) { //cliping
          let z =
            triCoords[0] * projectedVerts[0].z +
            triCoords[1] * projectedVerts[1].z +
            triCoords[2] * projectedVerts[2].z;
          if (z > this.zBuffer[xx][yy]) {
            this.buffer.setPixel(xx, yy, color);
            this.zBuffer[xx][yy] = z;
          }
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
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 49 lines of code.
  // ----------- STUDENT CODE END ------------
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
  for (var i = 0; i < 3; i++) {
    var va = projectedVerts[(i + 1) % 3];
    var vb = projectedVerts[(i + 2) % 3];
    const na = normals[(i + 1) % 3];
    const nb = normals[(i + 2) % 3];

    const phongMaterial = this.getPhongMaterial(uvs, material);
    const color = Reflection.phongReflectionModel(
      va,
      undefined,
      na,
      new THREE.Vector3(0, 1, 0),
      phongMaterial
    );

    // Draw filled in triangle face with color

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
