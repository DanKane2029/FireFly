import matplotlib.pyplot as plt
import numpy as np
import json

# A file used to debug 3d positions and vectors

fig = plt.figure(figsize=(5, 5))
ax = fig.add_subplot(projection='3d')
ax.set_box_aspect([1, 1, 1])

x = []
y = []
z = []

dx = []
dy = []
dz = []

with open("./cam_pos_dir.json") as json_file:
	data = json.load(json_file)
	for data_point in data:
		pos = data_point["cam_pos"]
		dir = data_point["cam_dir"]

		x.append(pos[0])
		y.append(pos[1])
		z.append(pos[2])

		dx.append(dir[0])
		dy.append(dir[1])
		dz.append(dir[2])


# ax.scatter3D(x, y, z)
# ax.plot(x, y, z)
ax.quiver(x, y, z, dx, dy, dz, length=1)

ax.set_xlim(xmin=-2, xmax=2)
ax.set_ylim(ymin=-2, ymax=2)
ax.set_zlim(zmin=-2, zmax=2)

ax.set_xlabel("X-axis Label")
ax.set_ylabel("Y-axis Label")
ax.set_zlabel("Z-axis Label")

plt.show()
