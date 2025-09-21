FROM nginx:stable-alpine

# Copy Vite's production build output
COPY dist /usr/share/nginx/html

# Custom nginx config to disable caching of index.html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
