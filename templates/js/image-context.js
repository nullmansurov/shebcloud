$(document).ready(function(){
  $(document).on('contextmenu', '#editor img', function(e){
    e.preventDefault();
    var $img = $(this);
    $('#img-context-menu').data('img', $img)
      .css({ top: e.pageY, left: e.pageX })
      .fadeIn(200);
  });
  
  $('#img-resize').click(function(){
    var $img = $('#img-context-menu').data('img');
    var newWidth = prompt("Введите новую ширину в пикселях:", $img.width());
    if(newWidth){
      $img.css('width', newWidth + "px");
    }
    $('#img-context-menu').fadeOut(200);
  });
  $('#img-align-left').click(function(){
    var $img = $('#img-context-menu').data('img');
    $img.css({ float: 'left', display: 'inline-block', margin: '0 10px 10px 0' });
    $('#img-context-menu').fadeOut(200);
  });
  $('#img-align-center').click(function(){
    var $img = $('#img-context-menu').data('img');
    $img.css({ float: 'none', display: 'block', margin: '10px auto' });
    $('#img-context-menu').fadeOut(200);
  });
  $('#img-align-right').click(function(){
    var $img = $('#img-context-menu').data('img');
    $img.css({ float: 'right', display: 'inline-block', margin: '0 0 10px 10px' });
    $('#img-context-menu').fadeOut(200);
  });
});
