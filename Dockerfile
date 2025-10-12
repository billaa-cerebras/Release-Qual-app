# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Add node_modules/.bin to the PATH
ENV PATH /app/node_modules/.bin:$PATH

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Make port 9002 available to the world outside this container
EXPOSE 9002

# Run the app when the container launches
CMD ["npm", "run", "dev"]
