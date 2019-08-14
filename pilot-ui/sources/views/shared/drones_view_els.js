const STATUSES_LIST_LIMIT = 50;

const home_marker_icon_params = {
    path: google.maps.SymbolPath.CIRCLE
    ,scale: 11
    ,fillColor: '#000000'
    ,fillOpacity: 0.8
    ,strokeColor: '#ffbd4d'
    ,strokeWeight: 2
    ,zIndex: 2000
};

const home_marker = function(){
    return new google.maps.Marker({
         icon: home_marker_icon_params
        ,label: {text: 'H', color: '#ffbd4d'}
        ,opacity: 0.8
        ,zIndex: 1
    });
};


const go_here_marker_icon = {
    path: google.maps.SymbolPath.CIRCLE
    ,scale: 11
    ,fillColor: '#ffbd4d'
    ,fillOpacity: 1.0
    ,strokeColor: '#000000'
    ,strokeWeight: 2
    ,zIndex: 2000
};

function GoHereMenu() {
    this.div_ = document.createElement('div');
    this.div_.className = 'gohere-menu';
    this.div_.innerHTML = 'Go here';
    this.marker = new google.maps.Marker({
        zIndex: 2
        ,clickable: true
        ,crossOnDrag: true
    });
    this.marker.setIcon(go_here_marker_icon);

    google.maps.event.addDomListener(this.div_, 'click', () => {
        const position = this.get('position');
        this.gohere(position.lat(), position.lng());
    });
}
GoHereMenu.prototype = new google.maps.OverlayView();
GoHereMenu.prototype.draw = function() {
    const position = this.get('position');
    const projection = this.getProjection();

    if (!position || !projection)  return;

    const point = projection.fromLatLngToDivPixel(position);
    this.div_.style.top = point.y + 'px';
    this.div_.style.left = point.x + 'px';
};
GoHereMenu.prototype.open = function(map, lat, lng) {
    const position = new google.maps.LatLng({lat: lat, lng: lng});
    this.set('position', position);
    this.setMap(map);
    this.draw();
    this.marker.setPosition(position);
    this.marker.setMap(map);
};
GoHereMenu.prototype.gohere = function(lat, lon){/* Redefine thin func */};
GoHereMenu.prototype.onAdd = function() {
    const _this = this;
    this.getPanes().floatPane.appendChild(this.div_);

    // mousedown anywhere on the map except on the menu div will close the menu
    this.divListener_ = google.maps.event.addDomListener(this.getMap().getDiv(), 'mousedown', function(e) {
        if (e.target != _this.div_) {
            _this.close();
            return false;
        }
    }, true);
};
GoHereMenu.prototype.onRemove = function() {
    google.maps.event.removeListener(this.divListener_);
    this.div_.parentNode.removeChild(this.div_);
    this.set('position');
};
GoHereMenu.prototype.close = function() {
    this.setMap(null);
    this.marker.setMap(null);
};



module.exports = {
    STATUSES_LIST_LIMIT,
    home_marker,
    go_here_marker_icon,
    GoHereMenu
};
